import { z } from 'zod';
import { CategorySchema } from './schemas';
import type { Category } from './types';

/**
 * Retailer-agnostic catalog record.
 *
 * `imageUrl` is a product photograph. `transparentImageUrl` is a separate try-on
 * asset. A rectangular product photo is not a try-on asset. When no try-on asset
 * exists, `tryOnAsset` is `schematic` (a labeled 2D preview) or `none`.
 *
 * Do not invent product URLs, prices, or inventory. Omit `productUrl` and `price`
 * when the source does not provide them.
 */

export const DEMO_CATALOG_SOURCE = 'fixture';
export const DEMO_BRAND_LABEL = 'Unbranded';
export const DEMO_RETAILER_LABEL = 'Demo catalog';
export const DEMO_ATTRIBUTION =
  'Demo catalog loaded from local fixtures/garments. Names and prices are placeholders, not live retailer prices, inventory, or product pages.';

export const TryOnAssetSchema = z.enum(['schematic', 'transparent', 'none']);

export const CatalogPriceSchema = z.object({
  amount: z.number().nonnegative().finite(),
  currency: z.string().length(3),
});

export const CatalogProductSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  title: z.string().min(1),
  brand: z.string().min(1),
  retailer: z.string().min(1),
  category: CategorySchema,
  price: CatalogPriceSchema.optional(),
  imageUrl: z.url().optional(),
  transparentImageUrl: z.url().optional(),
  productUrl: z.url().optional(),
  availableSizes: z.array(z.string().min(1)).optional(),
  color: z.string().min(1).optional(),
  tryOnAsset: TryOnAssetSchema,
  placeholder: z.boolean(),
  attribution: z.string().min(1),
});

export const CatalogQuerySchema = z.object({
  text: z.string().optional(),
  category: CategorySchema.optional(),
  brand: z.string().optional(),
  retailer: z.string().optional(),
  size: z.string().optional(),
  color: z.string().optional(),
  minPrice: z.number().nonnegative().finite().optional(),
  maxPrice: z.number().nonnegative().finite().optional(),
});

export type TryOnAsset = z.infer<typeof TryOnAssetSchema>;
export type CatalogPrice = z.infer<typeof CatalogPriceSchema>;
export type CatalogProduct = z.infer<typeof CatalogProductSchema>;
export type CatalogQuery = z.infer<typeof CatalogQuerySchema>;

export type CatalogGarmentInput = {
  id: string;
  sourceUrl: string | null;
  retailer: string | null;
  brand: string | null;
  name: string | null;
  category: Category;
  primaryImageUrl: string | null;
  primaryColor: string | null;
  priceCents: number | null;
  currency: string | null;
  sizeChart: { rows: { label: string }[] } | null;
  placeholder?: boolean;
};

export type RetailerAdapter = {
  readonly id: string;
  readonly label: string;
  readonly attribution: string;
  search(query: CatalogQuery): Promise<CatalogProduct[]>;
};

const CATEGORY_ORDER: readonly Category[] = ['top', 'bottom', 'outerwear', 'dress'];

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

export function catalogProductFromGarment(garment: CatalogGarmentInput): CatalogProduct {
  const price =
    garment.priceCents !== null && garment.currency !== null && garment.currency.length === 3
      ? { amount: garment.priceCents / 100, currency: garment.currency }
      : undefined;
  const sizes = garment.sizeChart?.rows.map((row) => row.label).filter((label) => label.length > 0);

  return CatalogProductSchema.parse({
    id: garment.id,
    source: DEMO_CATALOG_SOURCE,
    title: garment.name && garment.name.length > 0 ? garment.name : 'Untitled garment',
    brand: garment.brand && garment.brand.length > 0 ? garment.brand : DEMO_BRAND_LABEL,
    retailer:
      garment.retailer && garment.retailer.length > 0 ? garment.retailer : DEMO_RETAILER_LABEL,
    category: garment.category,
    ...(price ? { price } : {}),
    ...(garment.primaryImageUrl ? { imageUrl: garment.primaryImageUrl } : {}),
    ...(garment.sourceUrl ? { productUrl: garment.sourceUrl } : {}),
    ...(sizes && sizes.length > 0 ? { availableSizes: sizes } : {}),
    ...(garment.primaryColor ? { color: garment.primaryColor } : {}),
    tryOnAsset: 'schematic',
    placeholder: garment.placeholder === true,
    attribution: DEMO_ATTRIBUTION,
  });
}

export function filterCatalog(
  products: readonly CatalogProduct[],
  query: CatalogQuery,
): CatalogProduct[] {
  const text = query.text?.trim().toLowerCase();
  return products.filter((product) => {
    if (query.category && product.category !== query.category) return false;
    if (query.brand && product.brand.toLowerCase() !== query.brand.toLowerCase()) return false;
    if (query.retailer && product.retailer.toLowerCase() !== query.retailer.toLowerCase()) {
      return false;
    }
    if (query.color && (product.color ?? '').toLowerCase() !== query.color.toLowerCase()) {
      return false;
    }
    if (query.size) {
      const sizes = product.availableSizes ?? [];
      if (!sizes.some((size) => size.toLowerCase() === query.size?.toLowerCase())) return false;
    }
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      if (!product.price) return false;
      if (query.minPrice !== undefined && product.price.amount < query.minPrice) return false;
      if (query.maxPrice !== undefined && product.price.amount > query.maxPrice) return false;
    }
    if (text) {
      const haystack = [
        product.title,
        product.brand,
        product.retailer,
        product.category,
        product.color ?? '',
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(text)) return false;
    }
    return true;
  });
}

export function catalogFacets(products: readonly CatalogProduct[]): {
  categories: Category[];
  brands: string[];
  retailers: string[];
  colors: string[];
  sizes: string[];
} {
  const present = new Set(products.map((product) => product.category));
  return {
    categories: CATEGORY_ORDER.filter((category) => present.has(category)),
    brands: uniqueSorted(products.map((product) => product.brand)),
    retailers: uniqueSorted(products.map((product) => product.retailer)),
    colors: uniqueSorted(products.flatMap((product) => (product.color ? [product.color] : []))),
    sizes: uniqueSorted(products.flatMap((product) => product.availableSizes ?? [])),
  };
}
