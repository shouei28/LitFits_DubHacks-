import { describe, expect, it } from 'vitest';
import { colorToHex, schematicOverlaySvg } from './schematic';

describe('schematic overlays', () => {
  it('maps known fixture colors and rejects markup in a color string', () => {
    expect(colorToHex('light blue')).toBe('#93c5fd');
    expect(colorToHex('#112233')).toBe('#112233');
    expect(colorToHex('<script>alert(1)</script>')).toBe('#6b7280');
    const svg = schematicOverlaySvg('top', '<script>');
    expect(svg).toContain('<svg');
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('#6b7280');
  });

  it('draws a different shape per category', () => {
    const top = schematicOverlaySvg('top', 'white');
    const bottom = schematicOverlaySvg('bottom', 'indigo');
    expect(top).not.toEqual(bottom);
  });
});
