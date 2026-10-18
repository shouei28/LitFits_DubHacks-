import { describe, expect, it } from 'vitest';
import {
  BodyReconstructionSchema,
  FULL_BODY_GUIDANCE,
  RECONSTRUCTION_LIMITATION,
  type RgbaImage,
} from '@fitmirror/shared';
import {
  LOW_RESOLUTION_MESSAGE,
  MULTIPLE_SHAPES_MESSAGE,
  NO_PERSON_MESSAGE,
  STEP_BACK_MESSAGE,
  reconstructFromRgba,
} from './reconstruct';
import { segmentFallback } from './segment-fallback';

const segmenter = async (image: RgbaImage) => segmentFallback(image);

const now = new Date('2026-10-18T03:04:05.000Z');
const id = '00000000-0000-4000-8000-0000000000bb';

type Rgb = [number, number, number];

const paper: Rgb = [248, 246, 242];
const ink: Rgb = [18, 16, 20];

function blank(width: number, height: number, color: Rgb = paper): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index++) {
    const offset = index * 4;
    data[offset] = color[0];
    data[offset + 1] = color[1];
    data[offset + 2] = color[2];
    data[offset + 3] = 255;
  }
  return { width, height, data };
}

function stamp(image: RgbaImage, x: number, y: number, width: number, height: number, color: Rgb) {
  for (let row = y; row < y + height; row++) {
    for (let col = x; col < x + width; col++) {
      const offset = (row * image.width + col) * 4;
      image.data[offset] = color[0];
      image.data[offset + 1] = color[1];
      image.data[offset + 2] = color[2];
      image.data[offset + 3] = 255;
    }
  }
}

function standingFigure(): RgbaImage {
  const image = blank(320, 720);
  stamp(image, 140, 50, 40, 70, ink);
  stamp(image, 120, 120, 80, 280, ink);
  stamp(image, 90, 150, 24, 166, ink);
  stamp(image, 206, 150, 24, 166, ink);
  stamp(image, 90, 305, 30, 11, ink);
  stamp(image, 200, 305, 30, 11, ink);
  stamp(image, 125, 400, 30, 250, ink);
  stamp(image, 165, 400, 30, 250, ink);
  return image;
}

describe('reconstructFromRgba', () => {
  it('keeps tight bounds and a matching silhouette aspect for a tall rectangle', async () => {
    const image = blank(240, 400);
    stamp(image, 80, 30, 50, 300, ink);
    const result = await reconstructFromRgba(image, { segmenter, now, id });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reconstruction.normalizedBounds).toEqual({
      x: 80,
      y: 30,
      width: 50,
      height: 300,
    });
    expect(result.reconstruction.id).toBe(id);
    expect(result.reconstruction.createdAt).toBe('2026-10-18T03:04:05.000Z');
    expect(result.reconstruction.quality.source).toBe('fallback');
    expect(result.reconstruction.limitations).toContain(RECONSTRUCTION_LIMITATION);
    expect(BodyReconstructionSchema.safeParse(result.reconstruction).success).toBe(true);
    const boundsAspect =
      result.reconstruction.normalizedBounds.width / result.reconstruction.normalizedBounds.height;
    const silhouetteAspect =
      result.reconstruction.silhouette.width / result.reconstruction.silhouette.height;
    expect(Math.abs(boundsAspect - silhouetteAspect)).toBeLessThanOrEqual(0.02);
    expect(result.reconstruction.silhouette.height).toBeLessThanOrEqual(180);
    expect(result.reconstruction.silhouette.data).toContain(
      `viewBox="0 0 ${result.reconstruction.silhouette.width} ${result.reconstruction.silhouette.height}"`,
    );
    expect(result.reconstruction.silhouette.data).toContain('width="100%"');
    expect(result.reconstruction.silhouette.data).toContain('height="100%"');
    expect(result.reconstruction.silhouette.data).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(result.reconstruction.silhouette.data).toContain('currentColor');
  });

  it('gives a wide person and a narrow person different bounds aspects', async () => {
    const wide = blank(260, 260);
    stamp(wide, 40, 80, 180, 90, ink);
    const narrow = blank(260, 260);
    stamp(narrow, 100, 30, 50, 200, ink);
    const wideResult = await reconstructFromRgba(wide, { segmenter });
    const narrowResult = await reconstructFromRgba(narrow, { segmenter });
    expect(wideResult.ok).toBe(true);
    expect(narrowResult.ok).toBe(true);
    if (!wideResult.ok || !narrowResult.ok) return;
    const wideAspect =
      wideResult.reconstruction.normalizedBounds.width /
      wideResult.reconstruction.normalizedBounds.height;
    const narrowAspect =
      narrowResult.reconstruction.normalizedBounds.width /
      narrowResult.reconstruction.normalizedBounds.height;
    expect(wideAspect).not.toBeCloseTo(narrowAspect);
  });

  it('rejects an empty background, a length mismatch, and a zero width without throwing', async () => {
    const empty = await reconstructFromRgba(blank(80, 80), { segmenter });
    const mismatch = await reconstructFromRgba(
      { width: 4, height: 4, data: new Uint8ClampedArray(8) },
      { segmenter },
    );
    const zero = await reconstructFromRgba(
      { width: 0, height: 10, data: new Uint8ClampedArray(0) },
      { segmenter },
    );
    expect(empty).toMatchObject({ ok: false });
    expect(mismatch).toMatchObject({ ok: false });
    expect(zero).toMatchObject({ ok: false });
    if (!empty.ok) {
      expect(empty.messages).toContain(NO_PERSON_MESSAGE);
      expect(empty.messages).toContain(FULL_BODY_GUIDANCE);
    }
    if (!mismatch.ok) expect(mismatch.messages).toContain(FULL_BODY_GUIDANCE);
    if (!zero.ok) expect(zero.messages).toContain(FULL_BODY_GUIDANCE);
  });

  it('asks the person to step back when foreground covers the frame', async () => {
    const image = blank(100, 100);
    stamp(image, 2, 2, 96, 96, ink);
    const result = await reconstructFromRgba(image, { segmenter });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.messages).toContain(STEP_BACK_MESSAGE);
    expect(result.messages).toContain(FULL_BODY_GUIDANCE);
  });

  it('warns and keeps the larger blob when two significant shapes are present', async () => {
    const image = blank(220, 220);
    stamp(image, 30, 30, 70, 100, ink);
    stamp(image, 160, 40, 30, 40, ink);
    const result = await reconstructFromRgba(image, { segmenter });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reconstruction.quality.status).toBe('warning');
    expect(result.reconstruction.quality.messages).toContain(MULTIPLE_SHAPES_MESSAGE);
    expect(result.reconstruction.normalizedBounds).toEqual({
      x: 30,
      y: 30,
      width: 70,
      height: 100,
    });
  });

  it('estimates torso, shoulder, and leg ratios for a standing figure', async () => {
    const result = await reconstructFromRgba(standingFigure(), { segmenter });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { proportions, normalizedBounds } = result.reconstruction;
    const boundsAspect = normalizedBounds.width / normalizedBounds.height;
    expect(proportions?.torsoRatio).toBeGreaterThan(0.15);
    expect(proportions?.torsoRatio).toBeLessThan(0.55);
    expect(proportions?.shoulderWidthRatio).toBeLessThan(boundsAspect);
    expect(proportions?.upperLegRatio).toBeGreaterThan(0);
    expect(proportions?.lowerLegRatio).toBeGreaterThan(0);
    expect(result.reconstruction.limitations).toContain(RECONSTRUCTION_LIMITATION);
  });

  it('warns on a low-resolution photo instead of throwing', async () => {
    const image = blank(100, 220);
    stamp(image, 30, 20, 40, 160, ink);
    const result = await reconstructFromRgba(image, { segmenter });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reconstruction.quality.status).toBe('warning');
    expect(result.reconstruction.quality.messages).toContain(LOW_RESOLUTION_MESSAGE);
  });
});
