import type { BinaryMask, RgbaImage } from '@fitmirror/shared';

/** Euclidean RGB distance from the border median that counts as the person. */
export const FOREGROUND_RGB_DISTANCE = 36;

/** Components smaller than this fraction of the image are specks, unless the floor below is larger. */
export const SPECK_AREA_FRACTION = 0.002;

/** Absolute floor for the speck filter. A 15-pixel fleck is never a person. */
export const MIN_COMPONENT_PIXELS = 16;

export const INVALID_IMAGE_MESSAGE = 'The photo data is invalid.';

export type SegmentResult = {
  mask: BinaryMask;
  source: 'opencv' | 'fallback';
  significantComponentCount: number;
};

type Rgb = { r: number; g: number; b: number };

export function speckThreshold(pixelCount: number): number {
  return Math.max(MIN_COMPONENT_PIXELS, SPECK_AREA_FRACTION * pixelCount);
}

export function assertRgbaImage(image: RgbaImage): void {
  if (
    !image ||
    !Number.isInteger(image.width) ||
    !Number.isInteger(image.height) ||
    image.width < 1 ||
    image.height < 1 ||
    !image.data ||
    image.data.length !== image.width * image.height * 4
  ) {
    throw new Error(INVALID_IMAGE_MESSAGE);
  }
}

/**
 * Offline person mask. Border median is the background. The largest 4-connected
 * foreground component is kept; specks are dropped and counted separately.
 */
export function segmentFallback(image: RgbaImage): SegmentResult {
  assertRgbaImage(image);
  const foreground = foregroundMask(image);
  const selected = largestComponent(foreground, image.width, image.height);
  return {
    mask: { width: image.width, height: image.height, data: selected.mask },
    source: 'fallback',
    significantComponentCount: selected.significantComponentCount,
  };
}

export function foregroundMask(image: RgbaImage): Uint8Array {
  const { width, height, data } = image;
  const background = medianBorderRgb(image);
  const limit = FOREGROUND_RGB_DISTANCE * FOREGROUND_RGB_DISTANCE;
  const foreground = new Uint8Array(width * height);
  for (let index = 0; index < foreground.length; index++) {
    const offset = index * 4;
    const dr = (data[offset] ?? 0) - background.r;
    const dg = (data[offset + 1] ?? 0) - background.g;
    const db = (data[offset + 2] ?? 0) - background.b;
    if (dr * dr + dg * dg + db * db > limit) foreground[index] = 1;
  }
  return foreground;
}

export function medianBorderRgb(image: RgbaImage): Rgb {
  const red: number[] = [];
  const green: number[] = [];
  const blue: number[] = [];
  const push = (x: number, y: number) => {
    const offset = (y * image.width + x) * 4;
    red.push(image.data[offset] ?? 0);
    green.push(image.data[offset + 1] ?? 0);
    blue.push(image.data[offset + 2] ?? 0);
  };
  for (let x = 0; x < image.width; x++) push(x, 0);
  if (image.height > 1) {
    for (let x = 0; x < image.width; x++) push(x, image.height - 1);
  }
  for (let y = 1; y < image.height - 1; y++) {
    push(0, y);
    if (image.width > 1) push(image.width - 1, y);
  }
  return { r: median(red), g: median(green), b: median(blue) };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  return sorted[mid] ?? 0;
}

export type PixelBounds = { x: number; y: number; width: number; height: number };

export type ComponentSelection = {
  mask: Uint8Array;
  bounds: PixelBounds | null;
  significantComponentCount: number;
  foregroundCount: number;
};

/** Largest 4-connected component, ignoring specks. Bounds are tight around that component. */
export function largestComponent(
  foreground: Uint8Array,
  width: number,
  height: number,
): ComponentSelection {
  const count = width * height;
  const parent = new Int32Array(count);
  const rank = new Uint8Array(count);
  for (let index = 0; index < count; index++) parent[index] = index;

  const find = (index: number): number => {
    let root = index;
    while ((parent[root] ?? root) !== root) root = parent[root] ?? root;
    let cursor = index;
    while (cursor !== root) {
      const next = parent[cursor] ?? root;
      parent[cursor] = root;
      cursor = next;
    }
    return root;
  };

  const union = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    const leftRank = rank[leftRoot] ?? 0;
    const rightRank = rank[rightRoot] ?? 0;
    if (leftRank < rightRank) parent[leftRoot] = rightRoot;
    else if (leftRank > rightRank) parent[rightRoot] = leftRoot;
    else {
      parent[rightRoot] = leftRoot;
      rank[leftRoot] = leftRank + 1;
    }
  };

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const index = row + x;
      if (foreground[index] !== 1) continue;
      if (x > 0 && foreground[index - 1] === 1) union(index, index - 1);
      if (y > 0 && foreground[index - width] === 1) union(index, index - width);
    }
  }

  const sizes = new Map<number, number>();
  for (let index = 0; index < count; index++) {
    if (foreground[index] !== 1) continue;
    const root = find(index);
    sizes.set(root, (sizes.get(root) ?? 0) + 1);
  }

  const threshold = speckThreshold(count);
  let significantComponentCount = 0;
  let bestRoot = -1;
  let bestSize = 0;
  for (const [root, size] of sizes) {
    if (size < threshold) continue;
    significantComponentCount += 1;
    if (size > bestSize) {
      bestSize = size;
      bestRoot = root;
    }
  }

  const mask = new Uint8Array(count);
  if (bestRoot < 0) {
    return { mask, bounds: null, significantComponentCount, foregroundCount: 0 };
  }

  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let foregroundCount = 0;
  for (let index = 0; index < count; index++) {
    if (foreground[index] !== 1 || find(index) !== bestRoot) continue;
    mask[index] = 1;
    const x = index % width;
    const y = (index - x) / width;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    foregroundCount += 1;
  }

  return {
    mask,
    bounds: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
    significantComponentCount,
    foregroundCount,
  };
}
