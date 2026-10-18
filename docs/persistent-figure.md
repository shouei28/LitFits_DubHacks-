# Persistent figure

The figure card is a client component, `PersistentFigure`, mounted from the root layout inside `Providers` and after the page children. The layout stays a server component. The card is on every route. It reads `useFigureStore` only. There is no second session store.

The host is `position: fixed` over the viewport (`inset-0`, `z-40`) with `pointer-events: none`. Only the card or the restore/minimize chip sets `pointer-events: auto`, so the figure does not block clicks or scrolling on the page.

## Dismiss, minimize, and clear

Dismiss, minimize, and clear do different things.

- **Dismiss** sets `chrome.dismissed` and keeps the reconstruction and the worn garments. The card is replaced by a restore chip. Restore clears the flag and shows the same figure. The chip includes `DISMISS_FIGURE_EXPLANATION`: dismiss hides the figure on every page, the reconstruction and outfit stay on this device until you clear them or replace the photo, and restore brings the same figure back.
- **Minimize** collapses the card to a chip and keeps the reconstruction, the worn garments, and the saved outfits. Expand opens the card again.
- **Clear** deletes the reconstruction and the clothes currently on it, and resets chrome (corner, anchor, dismissed, minimized). Saved outfits stay. The card's "About this figure" disclosure includes `CLEAR_FIGURE_EXPLANATION` and the reconstruction limitation. The card is capped at about 62% of the screen height so the corner figure does not cover the page.

Saved outfits are copies of the worn list. Restoring one puts that copy back on the figure and shows the card.

## Persistence and hydration

Storage key: `fitmirror-figure-v1`. Version 1. The persisted fields are the reconstruction, worn garments, saved outfits, and chrome. Undo history is not persisted. Malformed JSON and schema failures rehydrate as an empty session.

The store uses `skipHydration` and rehydrates in the browser. The figure renders nothing until `useFigureStore.persist.hasHydrated()` is true, including the callback from `onFinishHydration`. That avoids painting an empty session over a saved one.

## Placement

The card sits in `chrome.corner` (default bottom-right). Dragging the handle stores `chrome.anchor`, the card's top-left as fractions of the viewport. Anchor overrides the corner. Choosing a corner calls `setCorner`, which clears the anchor.

The drag clamp keeps at least 48px of the card inside the viewport. Desktop width is 220px. Below 640px the width is `min(46vw, 220px)` and at least 160px, and the card stays in the viewport.

## Silhouette and overlays

The silhouette frame uses `normalizedBounds.width / normalizedBounds.height`. It is not cropped with `object-fit: cover`. An SVG silhouette is the stored markup, drawn at 100% of that frame. Worn titles are not written into the SVG.

Garments paint in `layerOrder` ascending, so later layers sit above earlier ones. Each worn item is an absolutely positioned box from `overlayFrame(transform, frameAspect(bounds))`. `rotation` is a CSS clockwise rotate.

Overlays are a **schematic preview** unless a transparent try-on asset exists.

- `overlayKind: "schematic"` draws `schematicOverlayDataUrl` and the visible label "Schematic preview". It is not a photograph of the garment on the body.
- `overlayKind: "transparent"` draws `overlayHref` when a transparent asset was stored. Product photos are not used in that slot.
- `overlayKind: "none"` draws no image.

The card shows `RECONSTRUCTION_LIMITATION` in small type. The silhouette is a 2D outline from one photo. It is not a 3D body, and it does not produce centimeter measurements. When `quality.status` is `warning`, the card shows `quality.messages`. With nothing worn, the silhouette stays and the card says "Nothing tried on yet".

## Studio

`/studio` is a server page that renders the client `StudioScreen`. The screen links to `/shop`, mounts `BodyCapture`, and lists whatever proportion ratios the reconstruction actually has (torso, shoulder width, hip width, upper and lower legs, arms, head) as fractions of height, with the same limitation sentence. It does not convert those ratios to centimeters. Worn garments can be removed, named, and saved. If the figure is dismissed, Studio shows a Restore figure button in addition to the floating chip.
