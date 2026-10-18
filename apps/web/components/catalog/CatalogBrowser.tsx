'use client';

import {
  CategorySchema,
  catalogFacets,
  schematicOverlayDataUrl,
  type CatalogPrice,
  type CatalogProduct,
  type CatalogQuery,
} from '@fitmirror/shared';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { searchCatalog, type CatalogSearchError } from '@/lib/catalog/registry';
import { useFigureStore } from '@/lib/store/figure-store';

type CatalogStatus = 'loading' | 'error' | 'empty' | 'ready';

const controlClass =
  'border-input bg-background text-foreground rounded-md border px-2 py-1.5 text-sm';

export function CatalogBrowser() {
  const [allProducts, setAllProducts] = useState<CatalogProduct[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [errors, setErrors] = useState<CatalogSearchError[]>([]);
  const [status, setStatus] = useState<CatalogStatus>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [text, setText] = useState('');
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [color, setColor] = useState('');
  const [size, setSize] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const wornIds = useWornProductIds();

  const facets = useMemo(() => catalogFacets(allProducts), [allProducts]);
  const query = useMemo(
    () =>
      catalogQueryFromFields({
        text,
        category,
        brand,
        color,
        size,
        minPrice,
        maxPrice,
      }),
    [text, category, brand, color, size, minPrice, maxPrice],
  );

  useEffect(() => {
    let cancelled = false;
    void searchCatalog({}).then((result) => {
      if (!cancelled) setAllProducts(result.products);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void searchCatalog(query)
      .then((result) => {
        if (cancelled) return;
        setProducts(result.products);
        setErrors(result.errors);
        if (result.products.length === 0 && result.errors.length > 0) {
          setErrorMessage(
            result.errors.map((error) => `${error.source}: ${error.message}`).join('; '),
          );
          setStatus('error');
          return;
        }
        setErrorMessage('');
        setStatus(result.products.length === 0 ? 'empty' : 'ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setProducts([]);
        setErrors([]);
        setErrorMessage(error instanceof Error ? error.message : 'Catalog search failed');
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {allProducts.length > 0 ? `${allProducts.length} fixture garments` : 'Demo catalog'}
        </p>
        <Link href="/studio" className="text-sm underline">
          Open studio
        </Link>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Search</span>
          <input
            data-testid="catalog-search"
            className={controlClass}
            type="search"
            value={text}
            autoComplete="off"
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <FacetSelect
          testId="catalog-category"
          label="Category"
          value={category}
          options={facets.categories}
          onChange={setCategory}
        />
        <FacetSelect
          testId="catalog-brand"
          label="Brand"
          value={brand}
          options={facets.brands}
          onChange={setBrand}
        />
        <FacetSelect
          testId="catalog-color"
          label="Color"
          value={color}
          options={facets.colors}
          onChange={setColor}
        />
        <FacetSelect
          testId="catalog-size"
          label="Size"
          value={size}
          options={facets.sizes}
          onChange={setSize}
        />
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Min price</span>
          <input
            data-testid="catalog-min-price"
            className={controlClass}
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={minPrice}
            onChange={(event) => setMinPrice(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Max price</span>
          <input
            data-testid="catalog-max-price"
            className={controlClass}
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={maxPrice}
            onChange={(event) => setMaxPrice(event.target.value)}
          />
        </label>
      </div>

      {status === 'loading' ? (
        <p className="text-muted-foreground mt-6 text-sm" data-testid="catalog-status">
          Loading catalog…
        </p>
      ) : null}
      {status === 'error' ? (
        <p className="text-destructive mt-6 text-sm" data-testid="catalog-status">
          {errorMessage}
        </p>
      ) : null}
      {status === 'empty' ? (
        <p className="mt-6 text-sm" data-testid="catalog-status">
          No garments match.
        </p>
      ) : null}
      {status === 'ready' && errors.length > 0 ? (
        <p className="text-destructive mt-6 text-sm">
          {errors.map((error) => `${error.source}: ${error.message}`).join('; ')}
        </p>
      ) : null}

      {status === 'ready' ? (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {products.map((product) => (
            <li key={product.id}>
              <ProductCard product={product} worn={wornIds.has(product.id)} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function FacetSelect({
  testId,
  label,
  value,
  options,
  onChange,
}: {
  testId: string;
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select
        data-testid={testId}
        className={controlClass}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Any</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function ProductCard({ product, worn }: { product: CatalogProduct; worn: boolean }) {
  const sizes = product.availableSizes ?? [];
  const [size, setSize] = useState(sizes[0] ?? '');
  const selectedSize = sizes.includes(size) ? size : sizes[0];

  return (
    <article
      data-testid={`product-card-${product.id}`}
      className="border-border bg-card flex h-full flex-col gap-3 rounded-lg border p-4"
    >
      {product.tryOnAsset === 'schematic' ? (
        <figure className="bg-muted rounded-md p-3">
          <img
            src={schematicOverlayDataUrl(product.category, product.color)}
            alt="Schematic preview"
            className="mx-auto h-36 w-full object-contain"
          />
          <figcaption className="text-muted-foreground mt-2 text-center text-xs">
            Schematic preview
          </figcaption>
        </figure>
      ) : null}
      {product.tryOnAsset === 'transparent' && product.transparentImageUrl ? (
        <img
          src={product.transparentImageUrl}
          alt=""
          className="bg-muted h-36 w-full rounded-md object-contain"
        />
      ) : null}
      {product.imageUrl ? (
        <img src={product.imageUrl} alt="" className="h-36 w-full rounded-md object-contain" />
      ) : null}

      <div className="flex flex-col gap-1 text-sm">
        <h2 className="text-lg font-semibold">{product.title}</h2>
        <p>Brand: {product.brand}</p>
        <p>Retailer: {product.retailer}</p>
        {product.color ? <p>Color: {product.color}</p> : null}
        {product.price ? <p>{formatCatalogPrice(product.price)}</p> : null}
        {sizes.length > 0 ? <p>Sizes: {sizes.join(', ')}</p> : null}
      </div>

      {product.placeholder ? (
        <p className="bg-muted text-muted-foreground w-fit rounded-md px-2 py-0.5 text-xs">
          Placeholder fixture
        </p>
      ) : null}
      <p className="text-muted-foreground text-xs">{product.attribution}</p>
      {product.productUrl ? (
        <a className="text-sm underline" href={product.productUrl} rel="noreferrer">
          View product
        </a>
      ) : null}

      {sizes.length > 0 ? (
        <label className="mt-auto flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Size</span>
          <select
            data-testid={`catalog-product-size-${product.id}`}
            className={controlClass}
            value={selectedSize}
            onChange={(event) => setSize(event.target.value)}
          >
            {sizes.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid={`wear-button-${product.id}`}
          className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm"
          onClick={() => {
            useFigureStore.getState().wear(product, selectedSize);
          }}
        >
          Try on
        </button>
        {worn ? (
          <button
            type="button"
            data-testid={`catalog-remove-${product.id}`}
            className="bg-secondary text-secondary-foreground rounded-md px-3 py-1.5 text-sm"
            onClick={() => {
              useFigureStore.getState().removeWorn(product.id);
            }}
          >
            Remove
          </button>
        ) : null}
      </div>
    </article>
  );
}

function useWornProductIds(): ReadonlySet<string> {
  const worn = useFigureStore((state) => state.worn);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const mark = () => setHydrated(true);
    if (useFigureStore.persist.hasHydrated()) mark();
    return useFigureStore.persist.onFinishHydration(mark);
  }, []);

  return useMemo(() => {
    if (!hydrated) return new Set<string>();
    return new Set(worn.map((item) => item.productId));
  }, [hydrated, worn]);
}

function catalogQueryFromFields(fields: {
  text: string;
  category: string;
  brand: string;
  color: string;
  size: string;
  minPrice: string;
  maxPrice: string;
}): CatalogQuery {
  const query: CatalogQuery = {};
  const text = fields.text.trim();
  if (text.length > 0) query.text = text;
  const category = CategorySchema.safeParse(fields.category);
  if (category.success) query.category = category.data;
  if (fields.brand.length > 0) query.brand = fields.brand;
  if (fields.color.length > 0) query.color = fields.color;
  if (fields.size.length > 0) query.size = fields.size;
  const minPrice = parseAmount(fields.minPrice);
  const maxPrice = parseAmount(fields.maxPrice);
  if (minPrice !== undefined) query.minPrice = minPrice;
  if (maxPrice !== undefined) query.maxPrice = maxPrice;
  return query;
}

function parseAmount(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return undefined;
  return value;
}

function formatCatalogPrice(price: CatalogPrice): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: price.currency,
    }).format(price.amount);
  } catch {
    return `${price.amount.toFixed(2)} ${price.currency}`;
  }
}
