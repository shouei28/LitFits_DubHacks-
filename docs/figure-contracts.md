# Figure contracts

Shared types for the photo silhouette, the persistent figure, and the clothing catalog. `packages/shared` is the only definition. The figure store at `apps/web/lib/store/figure-store.ts` is the only session store.

## Normalized body space

- Origin: top-left of `normalizedBounds` (the person box, in source-image pixels).
- `y` is a fraction of that box's height. `0` is the top of the person, `1` is the bottom.
- `x` is divided by the same height, not by the width. A value of `0.28` is 28% of body height.
- Do not stretch x and y independently into a square. The silhouette element keeps `bounds.width / bounds.height`.
- `frameAspect` and `overlayFrame` are the helpers for that mapping.
- Landmarks use the same space. Omit a landmark the mask cannot support. Do not write zeros for "unknown".

`scaleX` and `scaleY` on a worn garment are the overlay box width and height in these height units. `rotation` is degrees clockwise. `overlayFrame` turns a box into percentages of the silhouette element.

## Reconstruction

`BodyReconstruction` is a 2D silhouette plus optional proportion estimates from one photo.

- It is not a 3D body and it does not produce centimetre measurements. Absolute size still needs a known height or a tape measurement.
- The original photograph is not stored. Only the silhouette (SVG or PNG), bounds, optional landmarks, and ratios go into the session.
- `quality.status` is `ok` or `warning`. A rejected photo is not a reconstruction; return `{ ok: false, messages }` instead.
- `quality.source` is `opencv` or `fallback`.
- `limitations` always includes the shared `RECONSTRUCTION_LIMITATION` string (the schema defaults it).
- The silhouette aspect ratio must match `normalizedBounds` within 0.02. The schema rejects a stretched silhouette.

`BinaryMask` is row-major, `1` for the person and `0` for the background. `RgbaImage.data` is RGBA, length `width * height * 4`.

Image processing entry point (web app, not shared):

```ts
reconstructFromRgba(image: RgbaImage, options?: {
  segmenter?: (image: RgbaImage) => Promise<{ mask: BinaryMask; source: 'opencv' | 'fallback' }>;
  now?: Date;
  id?: string;
}): Promise<{ ok: true; reconstruction: BodyReconstruction } | { ok: false; messages: string[] }>
```

Parse success through `BodyReconstructionSchema` before calling `useFigureStore.getState().setReconstruction`. Invalid objects are ignored.

## Catalog

`CatalogProduct` is the retailer-agnostic product. `Garment` remains the database record. `catalogProductFromGarment` maps a fixture or garment into a catalog product.

- `imageUrl` is a product photo. `transparentImageUrl` is a try-on asset. They are different.
- Fixtures have neither photos nor try-on assets. Their `tryOnAsset` is `schematic`.
- Do not invent `productUrl`, prices, or stock. Null fixture URLs stay omitted.
- `RetailerAdapter.search` returns `CatalogProduct[]`. Retailer-specific code stays behind that interface.
- `filterCatalog` and `catalogFacets` are the search implementation. The UI calls them; it does not reimplement matching.

The only configured source today is the local fixture adapter (`source: "fixture"`). Those rows are placeholders. There is no live retailer API in this repo.

## Worn garments

`wear(product, size)` adds a garment or replaces the same category.

- A dress removes top and bottom. A top or bottom removes a dress.
- Layer order is `bottom` 0, `top` and `dress` 1, `outerwear` 2 (back to front).
- Schematic overlays are drawn with `schematicOverlayDataUrl`. The UI says they are a schematic preview, not a photograph of the garment on the body.
- A transparent asset uses `overlayKind: "transparent"` and `overlayHref`. Product photos are not stretched into that slot.

## Session chrome

Storage key: `fitmirror-figure-v1`. Version 1. Malformed JSON and schema failures rehydrate as an empty session.

- **Dismiss** sets `chrome.dismissed`. The reconstruction and worn garments stay. Restore clears the flag. Copy: `DISMISS_FIGURE_EXPLANATION`.
- **Minimize** collapses the card to a chip and keeps everything.
- **Clear** sets reconstruction and worn garments to empty and resets chrome. Saved outfits stay. Copy: `CLEAR_FIGURE_EXPLANATION`.
- **Anchor** is the card's top-left as fractions of the viewport. It overrides the corner until a corner button clears it.
- The floating layer is `pointer-events: none` except on the card itself.
- Wait for `useFigureStore.persist.hasHydrated()` before rendering persisted contents.

`saveOutfit` copies the worn list. `restoreOutfit` puts that copy back and shows the figure. Empty names and empty outfits are rejected.
