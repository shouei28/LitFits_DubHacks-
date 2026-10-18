import type { Metadata } from 'next';
import { CatalogBrowser } from '@/components/catalog/CatalogBrowser';

export const metadata: Metadata = {
  title: 'Shop',
};

export default function ShopPage() {
  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="text-2xl font-semibold">Shop</h1>
      <p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-6">
        These garments are local placeholder fixtures, not live retailer prices. Try on places a
        schematic overlay on the figure rather than a photograph of the garment on the body.
      </p>
      <CatalogBrowser />
    </main>
  );
}
