# Photo to silhouette

One front photo becomes a 2D silhouette plus proportion estimates. The fit verdict still comes from the fit engine and a size chart. This pipeline never produces a body measurement in centimetres.

Coordinates, the `BodyReconstruction` schema, and the session store are defined in `docs/figure-contracts.md` and `packages/shared/src/reconstruction.ts`. `apps/web/lib/store/figure-store.ts` is the only place a successful reconstruction is stored.

## What it does

`reconstructFromRgba` in `apps/web/lib/reconstruction/reconstruct.ts` takes an RGBA bitmap:

1. Segment the person from a plain background.
2. Keep the largest significant shape and its tight pixel bounds (`normalizedBounds`, in source-image pixels).
3. Estimate ratios and landmarks from that full-resolution mask. Omit anything the outline does not show.
4. Downsample the cropped mask to at most 180 pixels tall and emit an SVG. The SVG `viewBox` is the cropped size, with `width="100%"`, `height="100%"`, and `preserveAspectRatio="xMidYMid meet"`. Person runs are filled with `currentColor`.
5. Parse the object with `BodyReconstructionSchema`. The silhouette aspect must stay within 0.02 of `normalizedBounds.width / normalizedBounds.height`.

Success is `{ ok: true, reconstruction }`. A rejected photo is `{ ok: false, messages }` and is not stored. `BodyCapture` writes a success with `useFigureStore.getState().setReconstruction` and leaves an existing figure in place on failure.

The original photo is not stored. Capture resizes the long edge to 1600 pixels before segmentation so a phone photo stays in the browser. Bounds and `imageWidth` / `imageHeight` refer to that processed bitmap.

## Normalized body space

Origin is the top-left of `normalizedBounds`. Both `x` and `y` are divided by that box's height, not by its width. `y` is 0 at the top of the person and 1 at the bottom. A shoulder width of 0.28 is 28% of body height. Do not stretch x and y into a square. The full rules are in `docs/figure-contracts.md`.

## OpenCV and the offline fallback

The default segmenter tries OpenCV, then uses the pure fallback on any failure (missing module, init error, or no person found).

OpenCV (`@techstark/opencv-js`, loaded only inside `loadOpenCv`) subtracts the median gray level of the border and keeps the largest external contour. Every `cv.Mat` is deleted in a `finally` block. The package is imported dynamically so unit tests never load it. Pass `segmenter` to `reconstructFromRgba`, or call `segmentFallback` directly.

The fallback does not use the network:

- Background color is the median RGB of the border pixels.
- A pixel is foreground when its Euclidean RGB distance from that color exceeds `FOREGROUND_RGB_DISTANCE` (36).
- Only the largest 4-connected component is kept. Specks smaller than `max(16, 0.002 * pixel count)` are ignored. Extra significant components become a warning.

Pixels are not sent to a server or a third-party API.

## Proportions

These are outline ratios, not tape measurements. On the mask, inside the person box:

- The midline is the center x of the bounds. The central run is the foreground run that contains it, or the nearest run.
- Shoulder width is the widest central run from 12% to 40% down the box. Hip width is the widest central run from 45% to 70%. Both widths are divided by the box height, so a separated arm is not counted as the torso.
- `headRatio` is the shoulder row's distance from the top of the box. `torsoRatio` is the shoulder-to-hip span.
- The crotch is the first row below the hips where two runs sit on opposite sides of the midline. When the legs split, the knee is the narrowest leg band before the lower leg, and the ankle is the last foreground row. `upperLegRatio` and `lowerLegRatio` are fractions of the box height.
- `armRatio` is set only when a side run is actually separate from the torso. Landmarks are the ends of the runs that were found. Missing groups are omitted, not filled with zeros.

## Quality

`quality.source` is `opencv` or `fallback`. `limitations` includes `RECONSTRUCTION_LIMITATION`.

Rejected (`ok: false`), with `FULL_BODY_GUIDANCE`:

- No person, or only a speck.
- Foreground covers more than about 90% of the frame (step back).
- The bitmap is unreadable (width or height under 1, or the byte length does not match).

Warnings (`ok: true`, `quality.status` of `warning`):

- The person box is shorter than 45% of the image.
- The mask touches the image edge.
- More than one significant shape (the largest is used).
- The shortest image side is under 240 pixels.
- The box is wider than 0.9 times its height.

## Limits

This is a 2D outline of what the mask can see. It is not a 3D body, and it does not invent hidden anatomy such as a chest depth or a joint the outline does not separate.

A single uncalibrated photo cannot produce centimetres. Absolute size still needs a known height or a tape measurement. Loose clothing, shadows, a busy background, and hair that blends into the backdrop all change the mask, and the ratios move with it. OpenCV's border subtraction is the same idea as the fallback: it is not a learned body model.
