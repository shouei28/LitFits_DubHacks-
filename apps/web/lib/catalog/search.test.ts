import type { RetailerAdapter } from '@fitmirror/shared';
import { describe, expect, it } from 'vitest';
import { catalogAdapters, searchCatalog } from './registry';

describe('searchCatalog', () => {
  it('returns the straight jean for text jean', async () => {
    const result = await searchCatalog({ text: 'jean' });
    expect(result.errors).toEqual([]);
    expect(result.products.map((product) => product.title)).toEqual(['Placeholder straight jean']);
  });

  it('returns the three tops for category top', async () => {
    const result = await searchCatalog({ category: 'top' });
    expect(result.errors).toEqual([]);
    expect(result.products).toHaveLength(3);
    expect(result.products.every((product) => product.category === 'top')).toBe(true);
  });

  it('matches the Unbranded fixture products and rejects an unknown brand', async () => {
    const all = await searchCatalog({});
    const unbranded = await searchCatalog({ brand: 'Unbranded' });
    expect(unbranded.errors).toEqual([]);
    expect(unbranded.products.map((product) => product.id)).toEqual(
      all.products.map((product) => product.id),
    );
    expect(unbranded.products.every((product) => product.brand === 'Unbranded')).toBe(true);

    const missing = await searchCatalog({ brand: 'No Such Brand' });
    expect(missing.errors).toEqual([]);
    expect(missing.products).toEqual([]);
  });

  it('matches tops that have size M and returns nothing for a nonsense size', async () => {
    const sized = await searchCatalog({ size: 'M' });
    expect(sized.errors).toEqual([]);
    const tops = sized.products.filter((product) => product.category === 'top');
    expect(tops).toHaveLength(3);
    expect(tops.every((product) => product.availableSizes?.includes('M'))).toBe(true);
    expect(sized.products.every((product) => product.availableSizes?.includes('M'))).toBe(true);
    expect(sized.products.some((product) => product.title.includes('jean'))).toBe(false);

    const nonsense = await searchCatalog({ size: 'not-a-size' });
    expect(nonsense.errors).toEqual([]);
    expect(nonsense.products).toEqual([]);
  });

  it('can exclude the expensive jacket with a max price', async () => {
    const all = await searchCatalog({});
    const jacket = all.products.find((product) => product.title === 'Placeholder chore jacket');
    expect(jacket?.price?.amount).toBe(119);

    const capped = await searchCatalog({ maxPrice: 100 });
    expect(capped.errors).toEqual([]);
    expect(capped.products.some((product) => product.id === jacket?.id)).toBe(false);
    expect(capped.products).toHaveLength(all.products.length - 1);
    expect(capped.products.every((product) => (product.price?.amount ?? Infinity) <= 100)).toBe(
      true,
    );
  });

  it('sorts titles and keeps the default registry on fixtures', async () => {
    const result = await searchCatalog({});
    const titles = result.products.map((product) => product.title);
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));
    expect(titles[0]).toBe('Placeholder chino');
    expect(catalogAdapters.map((adapter) => adapter.id)).toEqual(['fixture']);
  });

  it('keeps fixture results when an injected adapter throws', async () => {
    const failing: RetailerAdapter = {
      id: 'broken-retailer',
      label: 'Broken retailer',
      attribution: 'Test adapter that throws.',
      search() {
        throw new Error('network down');
      },
    };

    const result = await searchCatalog({ text: 'jean' }, [failing, ...catalogAdapters]);
    expect(result.errors).toEqual([{ source: 'broken-retailer', message: 'network down' }]);
    expect(result.products.map((product) => product.title)).toEqual(['Placeholder straight jean']);
    expect(result.products.every((product) => product.source === 'fixture')).toBe(true);
    expect(catalogAdapters.map((adapter) => adapter.id)).toEqual(['fixture']);
  });
});
