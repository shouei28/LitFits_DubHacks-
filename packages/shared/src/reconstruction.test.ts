import { describe, expect, it } from 'vitest';
import { BodyReconstructionSchema, RECONSTRUCTION_LIMITATION, frameAspect } from './reconstruction';

const valid = {
  id: '00000000-0000-4000-8000-0000000000aa',
  imageWidth: 100,
  imageHeight: 200,
  silhouette: {
    format: 'svg' as const,
    data: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 100"></svg>',
    width: 40,
    height: 100,
  },
  normalizedBounds: { x: 30, y: 10, width: 40, height: 100 },
  quality: { status: 'ok' as const, messages: [], source: 'fallback' as const },
  createdAt: '2026-10-18T00:00:00.000Z',
};

describe('BodyReconstructionSchema', () => {
  it('preserves the silhouette aspect ratio and defaults the limitation', () => {
    const parsed = BodyReconstructionSchema.parse(valid);
    expect(frameAspect(parsed.normalizedBounds)).toBeCloseTo(
      parsed.silhouette.width / parsed.silhouette.height,
    );
    expect(parsed.limitations).toEqual([RECONSTRUCTION_LIMITATION]);
  });

  it('rejects a silhouette stretched away from the body bounds', () => {
    const result = BodyReconstructionSchema.safeParse({
      ...valid,
      silhouette: { ...valid.silhouette, width: 100, height: 100 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects bounds that leave the image', () => {
    const result = BodyReconstructionSchema.safeParse({
      ...valid,
      normalizedBounds: { x: 80, y: 10, width: 40, height: 100 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed id and a non-positive image', () => {
    expect(BodyReconstructionSchema.safeParse({ ...valid, id: 'nope' }).success).toBe(false);
    expect(BodyReconstructionSchema.safeParse({ ...valid, imageWidth: 0 }).success).toBe(false);
  });
});
