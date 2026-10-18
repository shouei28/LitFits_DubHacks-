import type { Category } from './types';

/**
 * Schematic garment drawings for the 2D preview. These are not product photos
 * and they are not draped cloth. The figure UI must label them as a schematic preview.
 */

const NAMED_COLORS: Record<string, string> = {
  white: '#f4f4f5',
  khaki: '#c3b091',
  'heather grey': '#9ca3af',
  indigo: '#3730a3',
  black: '#18181b',
  olive: '#3f6212',
  'light blue': '#93c5fd',
  oatmeal: '#d6d3d1',
};

const FALLBACK_COLOR = '#6b7280';

export function colorToHex(color: string | null | undefined): string {
  if (!color) return FALLBACK_COLOR;
  const named = NAMED_COLORS[color.trim().toLowerCase()];
  if (named) return named;
  if (/^#[0-9a-fA-F]{6}$/.test(color.trim())) return color.trim();
  return FALLBACK_COLOR;
}

function svg(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">${body}</svg>`;
}

function shape(category: Category, hex: string): string {
  const fill = `fill="${hex}" fill-opacity="0.94"`;
  switch (category) {
    case 'top':
      return `<path ${fill} d="M32 30 L18 36 L8 42 L12 58 L24 52 L28 108 H72 L76 52 L88 58 L92 42 L82 36 L68 30 L60 38 H40 Z"/>`;
    case 'bottom':
      return `<path ${fill} d="M30 6 H70 V18 H64 L74 114 H54 L49 36 L46 114 H26 L36 18 H30 Z"/>`;
    case 'outerwear':
      return `<path ${fill} d="M34 24 L16 32 L6 40 L12 60 L26 50 L30 112 H46 L48 48 H52 L54 112 H70 L74 50 L88 60 L94 40 L84 32 L66 24 L58 34 H42 Z"/><path fill="none" stroke="#111827" stroke-opacity="0.35" stroke-width="1.5" d="M50 36 V108"/>`;
    case 'dress':
      return `<path ${fill} d="M36 22 L20 30 L10 38 L16 54 L28 46 L24 112 H76 L72 46 L84 54 L90 38 L80 30 L64 22 L56 32 H44 Z"/>`;
  }
}

export function schematicOverlaySvg(category: Category, color?: string | null): string {
  return svg(shape(category, colorToHex(color)));
}

export function schematicOverlayDataUrl(category: Category, color?: string | null): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(schematicOverlaySvg(category, color))}`;
}
