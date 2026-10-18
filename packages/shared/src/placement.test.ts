import { describe, expect, it } from 'vitest';
import { overlayFrame, placementFor } from './placement';

describe('placementFor', () => {
  it('centers each garment on the body and keeps a wider shoulder wider', () => {
    const narrow = placementFor('top', 0.4, { shoulderWidthRatio: 0.22 });
    const wide = placementFor('top', 0.4, { shoulderWidthRatio: 0.36 });
    expect(wide.scaleX).toBeGreaterThan(narrow.scaleX);
    for (const transform of [narrow, wide]) {
      const frame = overlayFrame(transform, 0.4);
      expect(frame.leftPct + frame.widthPct / 2).toBeCloseTo(50);
      expect(transform.rotation).toBe(0);
      expect(transform.scaleY).toBeGreaterThan(0);
    }
  });

  it('does not stretch a narrow figure and a wide figure into the same box', () => {
    const slim = overlayFrame(placementFor('bottom', 0.3), 0.3);
    const broad = overlayFrame(placementFor('bottom', 0.7), 0.7);
    expect(slim.widthPct).not.toBeCloseTo(broad.widthPct);
  });

  it('stacks outerwear over tops over bottoms', () => {
    const bottom = placementFor('bottom', 0.42);
    const top = placementFor('top', 0.42);
    const coat = placementFor('outerwear', 0.42);
    expect(bottom.y).toBeGreaterThan(top.y);
    expect(coat.scaleX).toBeGreaterThan(top.scaleX);
  });
});
