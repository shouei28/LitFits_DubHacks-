import { describe, expect, it } from 'vitest';
import {
  DEMO_ATTRIBUTION,
  DEMO_BRAND_LABEL,
  DEMO_RETAILER_LABEL,
  catalogFacets,
  catalogProductFromGarment,
  filterCatalog,
  type CatalogProduct,
} from './catalog';

const tee = catalogProductFromGarment({
  id: '00000000-0000-4000-8000-000000000001',
  sourceUrl: null,
  retailer: null,
  brand: null,
  name: 'Placeholder crew tee',
  category: 'top',
  primaryImageUrl: null,
  primaryColor: 'white',
  priceCents: 2500,
  currency: 'USD',
  sizeChart: { rows: [{ label: 'S' }, { label: 'M' }] },
  placeholder: true,
});

const jean: CatalogProduct = {
  ...tee,
  id: '00000000-0000-4000-8000-000000000003',
  title: 'Placeholder straight jean',
  category: 'bottom',
  color: 'indigo',
  price: { amount: 79, currency: 'USD' },
  availableSizes: ['30', '32'],
  brand: 'Northmill',
  retailer: 'Northmill',
};

describe('catalogProductFromGarment', () => {
  it('keeps fixture prices and does not invent a product URL', () => {
    expect(tee.price).toEqual({ amount: 25, currency: 'USD' });
    expect(tee.productUrl).toBeUndefined();
    expect(tee.imageUrl).toBeUndefined();
    expect(tee.transparentImageUrl).toBeUndefined();
    expect(tee.tryOnAsset).toBe('schematic');
    expect(tee.brand).toBe(DEMO_BRAND_LABEL);
    expect(tee.retailer).toBe(DEMO_RETAILER_LABEL);
    expect(tee.attribution).toBe(DEMO_ATTRIBUTION);
    expect(tee.placeholder).toBe(true);
    expect(tee.availableSizes).toEqual(['S', 'M']);
  });
});

describe('filterCatalog', () => {
  const products = [tee, jean];

  it('filters by text, category, brand, size, and price', () => {
    expect(filterCatalog(products, { text: 'jean' }).map((item) => item.id)).toEqual([jean.id]);
    expect(filterCatalog(products, { category: 'top' })).toHaveLength(1);
    expect(filterCatalog(products, { brand: 'Northmill' })).toEqual([jean]);
    expect(filterCatalog(products, { brand: 'missing' })).toEqual([]);
    expect(filterCatalog(products, { size: 'm' })).toEqual([tee]);
    expect(filterCatalog(products, { minPrice: 50, maxPrice: 80 })).toEqual([jean]);
    expect(filterCatalog(products, { color: 'white' })).toEqual([tee]);
  });

  it('drops products with no price when a price bound is set', () => {
    const unpriced: CatalogProduct = { ...tee, id: 'x', price: undefined };
    expect(filterCatalog([unpriced], { maxPrice: 10 })).toEqual([]);
  });

  it('lists facets from the products on hand', () => {
    expect(catalogFacets(products).brands).toEqual(['Northmill', 'Unbranded']);
    expect(catalogFacets(products).categories).toEqual(['top', 'bottom']);
  });
});
