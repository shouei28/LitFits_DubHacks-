import type { BinaryMask, Silhouette } from '@fitmirror/shared';
import type { PixelBounds } from './segment-fallback';

/** Longest edge of the SVG mask. The viewBox uses this downsampled crop, not the source photo. */
export const MAX_SILHOUETTE_HEIGHT = 180;

const ASPECT_TOLERANCE = 0.02;
const MAX_SVG_CHARS = 450_000;

type Rect = { x: number; y: number; w: number; h: number };

/**
 * Crop to the person box, downsample to at most 180px tall, and paint horizontal runs.
 * `silhouette.width / height` stays within 0.02 of the original bounds aspect.
 */
export function silhouetteFromMask(mask: BinaryMask, bounds: PixelBounds): Silhouette {
  let maxHeight = MAX_SILHOUETTE_HEIGHT;
  let silhouette = render(mask, bounds, maxHeight);
  while (silhouette.data.length > MAX_SVG_CHARS && maxHeight > 24) {
    maxHeight = Math.floor(maxHeight / 2);
    silhouette = render(mask, bounds, maxHeight);
  }
  return silhouette;
}

function render(mask: BinaryMask, bounds: PixelBounds, maxHeight: number): Silhouette {
  const size = outputSize(bounds.width, bounds.height, maxHeight);
  const cropped = downsample(mask, bounds, size.width, size.height);
  const rects = rectsFromMask(cropped, size.width, size.height);
  return {
    format: 'svg',
    data: svgDocument(rects, size.width, size.height),
    width: size.width,
    height: size.height,
  };
}

export function outputSize(
  srcWidth: number,
  srcHeight: number,
  maxHeight: number,
): { width: number; height: number } {
  if (srcHeight <= maxHeight) return { width: srcWidth, height: srcHeight };
  const target = srcWidth / srcHeight;
  const height = maxHeight;
  const rounded = Math.max(1, Math.round(height * target));
  if (Math.abs(rounded / height - target) <= ASPECT_TOLERANCE) {
    return { width: rounded, height };
  }
  for (const candidate of [Math.floor(height * target), Math.ceil(height * target), rounded]) {
    if (candidate >= 1 && Math.abs(candidate / height - target) <= ASPECT_TOLERANCE) {
      return { width: candidate, height };
    }
  }
  for (let next = height - 1; next >= 1; next--) {
    const width = Math.max(1, Math.round(next * target));
    if (Math.abs(width / next - target) <= ASPECT_TOLERANCE) return { width, height: next };
  }
  return { width: rounded, height };
}

function downsample(
  mask: BinaryMask,
  bounds: PixelBounds,
  outWidth: number,
  outHeight: number,
): Uint8Array {
  const out = new Uint8Array(outWidth * outHeight);
  if (outWidth === bounds.width && outHeight === bounds.height) {
    for (let y = 0; y < outHeight; y++) {
      const src = (bounds.y + y) * mask.width + bounds.x;
      const dst = y * outWidth;
      for (let x = 0; x < outWidth; x++) out[dst + x] = mask.data[src + x] === 1 ? 1 : 0;
    }
    return out;
  }

  const votes = new Uint32Array(out.length);
  const totals = new Uint32Array(out.length);
  for (let y = 0; y < bounds.height; y++) {
    const oy = Math.min(outHeight - 1, Math.floor((y * outHeight) / bounds.height));
    const src = (bounds.y + y) * mask.width + bounds.x;
    for (let x = 0; x < bounds.width; x++) {
      const ox = Math.min(outWidth - 1, Math.floor((x * outWidth) / bounds.width));
      const index = oy * outWidth + ox;
      totals[index] = (totals[index] ?? 0) + 1;
      if (mask.data[src + x] === 1) votes[index] = (votes[index] ?? 0) + 1;
    }
  }
  for (let index = 0; index < out.length; index++) {
    const total = totals[index] ?? 0;
    const vote = votes[index] ?? 0;
    if (total > 0 && vote * 2 >= total) out[index] = 1;
  }
  return out;
}

function rectsFromMask(data: Uint8Array, width: number, height: number): Rect[] {
  const active = new Map<string, Rect>();
  const finished: Rect[] = [];
  for (let y = 0; y < height; y++) {
    const seen = new Set<string>();
    const row = y * width;
    let x = 0;
    while (x < width) {
      if (data[row + x] !== 1) {
        x += 1;
        continue;
      }
      const start = x;
      x += 1;
      while (x < width && data[row + x] === 1) x += 1;
      const key = `${start},${x - start}`;
      seen.add(key);
      const existing = active.get(key);
      if (existing && existing.y + existing.h === y) existing.h += 1;
      else {
        if (existing) finished.push(existing);
        active.set(key, { x: start, y, w: x - start, h: 1 });
      }
    }
    for (const [key, rect] of active) {
      if (!seen.has(key)) {
        finished.push(rect);
        active.delete(key);
      }
    }
  }
  for (const rect of active.values()) finished.push(rect);
  return finished;
}

function svgDocument(rects: Rect[], width: number, height: number): string {
  const body = rects
    .map(
      (rect) =>
        `<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" fill="currentColor"/>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">${body}</svg>`;
}
