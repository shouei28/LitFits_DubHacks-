import { describe, expect, it } from 'vitest';
import { FigurePersistedSchema } from './figure-session';

describe('FigurePersistedSchema', () => {
  it('rejects an unknown corner and a transparent overlay with no asset', () => {
    expect(
      FigurePersistedSchema.safeParse({
        reconstruction: null,
        worn: [],
        savedOutfits: [],
        chrome: { dismissed: false, minimized: false, corner: 'middle', anchor: null },
      }).success,
    ).toBe(false);

    expect(
      FigurePersistedSchema.safeParse({
        reconstruction: null,
        worn: [
          {
            productId: 'p1',
            category: 'top',
            layerOrder: 1,
            size: null,
            title: 'Tee',
            color: null,
            source: 'fixture',
            transform: { x: 0, y: 0, scaleX: 0.2, scaleY: 0.3, rotation: 0 },
            overlayHref: null,
            overlayKind: 'transparent',
          },
        ],
        savedOutfits: [],
        chrome: { dismissed: false, minimized: false, corner: 'bottom-right', anchor: null },
      }).success,
    ).toBe(false);
  });
});
