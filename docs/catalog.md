# Catalog

The shop at `/shop` lists garments and tries them on the persistent figure. The fit engine is not part of this page: cards do not show fit scores or a recommended size.

## Source of data

The only configured source is the local fixture adapter (`id: "fixture"`, label `Demo catalog`). It statically imports every `fixtures/garments/*.json` file, validates each with `GarmentFixtureSchema`, and maps it with `catalogProductFromGarment`.

Those files are placeholders (`"placeholder": true`). `docs/build-plan.md` question 5 still has no named retailers, and this repo has no retailer API keys. The shop therefore does not call a live retailer API and does not invent brands, retailers, prices, stock, or product URLs.

Null fixture fields stay honest:

- `brand: null` becomes the shared label `Unbranded`.
- `retailer: null` becomes `Demo catalog`.
- `sourceUrl: null` omits `productUrl`, so the card does not render a product link.
- `primaryImageUrl: null` omits `imageUrl`. The card does not render a broken image.

Every product's `source` is `"fixture"`. The attribution string is the shared `DEMO_ATTRIBUTION`:

> Demo catalog loaded from local fixtures/garments. Names and prices are placeholders, not live retailer prices, inventory, or product pages.

## Adapter extension point

`RetailerAdapter` in `packages/shared` is the retailer-agnostic interface (`id`, `label`, `attribution`, `search`). `apps/web/lib/catalog/registry.ts` exports `catalogAdapters`. Today that array is only `fixtureCatalogAdapter`.

A future retailer implements `RetailerAdapter` and is appended to `catalogAdapters`. `searchCatalog` runs every adapter, records `{ source, message }` when one throws, keeps the other products, and sorts the combined list by title. Retailer-specific parsing stays inside that adapter. It should omit `productUrl`, `price`, and stock fields the API did not return.

`filterCatalog` and `catalogFacets` in `packages/shared` are the search and facet implementation. The shop calls them through the adapter and `catalogFacets(all products)`. It does not keep a hardcoded retailer list.

## Schematic and transparent assets

Fixture products set `tryOnAsset` to `schematic`. They have no product photo and no transparent try-on asset. Try on calls `useFigureStore.getState().wear(product, selectedSize)`, and the figure draws `schematicOverlayDataUrl`: a labeled 2D shape in the garment color. The shop calls that drawing a schematic preview. It is not a photograph of the garment on the body.

`imageUrl` (a product photograph) and `transparentImageUrl` (a try-on asset) are different. A future product that actually has `transparentImageUrl` uses `overlayKind: "transparent"` and that URL. A rectangular product photo is never stretched into the overlay slot. `tryOnAsset: "none"` means there is nothing to draw.

## Prices

Prices are placeholder fixture values: `priceCents / 100` with the fixture currency (`USD` on the current files). The chore jacket is `11900` cents, so the card shows $119.00. Missing `priceCents` or a currency that is not three letters omits `price`, and the card shows no price. The min and max inputs filter on that numeric amount. They are not live retailer prices.
