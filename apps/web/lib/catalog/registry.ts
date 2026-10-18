import {
  CatalogQuerySchema,
  type CatalogProduct,
  type CatalogQuery,
  type RetailerAdapter,
} from '@fitmirror/shared';
import { fixtureCatalogAdapter } from './fixture-adapter';

/**
 * Configured catalog sources. A future retailer adapter implements `RetailerAdapter`
 * and is appended here. Build-plan question 5 names no retailers and this repo has
 * no retailer API keys, so the array stays on the local fixtures.
 */
export const catalogAdapters: readonly RetailerAdapter[] = [fixtureCatalogAdapter];

export type CatalogSearchError = {
  source: string;
  message: string;
};

export async function searchCatalog(
  query: CatalogQuery,
  adapters: readonly RetailerAdapter[] = catalogAdapters,
): Promise<{ products: CatalogProduct[]; errors: CatalogSearchError[] }> {
  const parsed = CatalogQuerySchema.safeParse(query);
  if (!parsed.success) {
    return {
      products: [],
      errors: [{ source: 'query', message: 'Invalid catalog query' }],
    };
  }

  const settled = await Promise.all(
    adapters.map(async (adapter) => {
      try {
        const products = await adapter.search(parsed.data);
        return { products, error: null };
      } catch (error) {
        return {
          products: [] as CatalogProduct[],
          error: { source: adapter.id, message: messageOf(error) },
        };
      }
    }),
  );

  const products = settled
    .flatMap((item) => item.products)
    .sort((a, b) => a.title.localeCompare(b.title));
  const errors = settled.flatMap((item) => (item.error ? [item.error] : []));
  return { products, errors };
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  if (typeof error === 'string' && error.trim().length > 0) return error;
  return 'Catalog search failed';
}
