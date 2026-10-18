import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEMO_ATTRIBUTION,
  DEMO_BRAND_LABEL,
  DEMO_RETAILER_LABEL,
  GarmentFixtureSchema,
} from '@fitmirror/shared';
import { describe, expect, it } from 'vitest';
import { fixtureCatalogAdapter } from './fixture-adapter';

const dir = join(import.meta.dirname, '../../../../fixtures/garments');
const files = readdirSync(dir).filter((file) => file.endsWith('.json'));

describe('fixture catalog adapter', () => {
  it('identifies the local demo catalog', () => {
    expect(fixtureCatalogAdapter.id).toBe('fixture');
    expect(fixtureCatalogAdapter.label).toBe('Demo catalog');
    expect(fixtureCatalogAdapter.attribution).toBe(DEMO_ATTRIBUTION);
  });

  it('loads all 8 fixtures with unique ids and honest placeholder fields', async () => {
    expect(files).toHaveLength(8);
    const products = await fixtureCatalogAdapter.search({});
    expect(products).toHaveLength(8);
    expect(new Set(products.map((product) => product.id)).size).toBe(products.length);

    for (const file of files) {
      const fixture = GarmentFixtureSchema.parse(
        JSON.parse(readFileSync(join(dir, file), 'utf8')) as unknown,
      );
      const product = products.find((item) => item.id === fixture.id);
      expect(product, file).toBeDefined();
      expect(product?.source).toBe('fixture');
      expect(product?.productUrl).toBeUndefined();
      expect(product?.imageUrl).toBeUndefined();
      expect(product?.transparentImageUrl).toBeUndefined();
      expect(product?.tryOnAsset).toBe('schematic');
      expect(product?.placeholder).toBe(true);
      expect(product?.attribution).toBe(DEMO_ATTRIBUTION);
      expect(fixture.brand).toBeNull();
      expect(product?.brand).toBe(DEMO_BRAND_LABEL);
      expect(fixture.retailer).toBeNull();
      expect(product?.retailer).toBe(DEMO_RETAILER_LABEL);
      expect(fixture.priceCents).not.toBeNull();
      expect(fixture.currency).toBe('USD');
      expect(product?.price).toEqual({
        amount: (fixture.priceCents ?? 0) / 100,
        currency: fixture.currency,
      });
    }
  });
});
