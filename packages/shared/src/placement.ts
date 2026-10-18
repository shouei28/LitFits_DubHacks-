import type { Category } from './types';
import type { GarmentTransform } from './figure-session';
import type { Proportions } from './reconstruction';

/**
 * Garment boxes live in normalized body space (see reconstruction.ts).
 * `scaleX` and `scaleY` are the box width and height in body-height units, not
 * unitless multipliers. `overlayFrame` converts a box into percentages of the
 * silhouette frame. The frame's aspect ratio must stay `bounds.width / bounds.height`.
 */

/** Paint order, back to front. A dress and a top share a layer and are mutually exclusive. */
export const LAYER_ORDER: Record<Category, number> = {
  bottom: 0,
  dress: 1,
  top: 1,
  outerwear: 2,
};

/**
 * Generic adult front-view ratios used only when a reconstruction has no
 * proportion estimates. These are not the user's measurements.
 */
export const GENERIC_PROPORTIONS: Required<Proportions> = {
  torsoRatio: 0.3,
  upperLegRatio: 0.24,
  lowerLegRatio: 0.25,
  armRatio: 0.33,
  shoulderWidthRatio: 0.28,
  hipWidthRatio: 0.22,
  headRatio: 0.13,
};

/** Width / height of a typical standing figure when no reconstruction exists yet. */
export const DEFAULT_BODY_ASPECT = 0.42;

export type OverlayFrame = {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
};

function resolvedProportions(proportions?: Proportions): Required<Proportions> {
  return {
    torsoRatio: proportions?.torsoRatio ?? GENERIC_PROPORTIONS.torsoRatio,
    upperLegRatio: proportions?.upperLegRatio ?? GENERIC_PROPORTIONS.upperLegRatio,
    lowerLegRatio: proportions?.lowerLegRatio ?? GENERIC_PROPORTIONS.lowerLegRatio,
    armRatio: proportions?.armRatio ?? GENERIC_PROPORTIONS.armRatio,
    shoulderWidthRatio: proportions?.shoulderWidthRatio ?? GENERIC_PROPORTIONS.shoulderWidthRatio,
    hipWidthRatio: proportions?.hipWidthRatio ?? GENERIC_PROPORTIONS.hipWidthRatio,
    headRatio: proportions?.headRatio ?? GENERIC_PROPORTIONS.headRatio,
  };
}

export function placementFor(
  category: Category,
  aspectRatio: number,
  proportions?: Proportions,
): GarmentTransform {
  const aspect = aspectRatio > 0 ? aspectRatio : DEFAULT_BODY_ASPECT;
  const ratios = resolvedProportions(proportions);
  const center = aspect / 2;
  const head = ratios.headRatio;
  const torso = ratios.torsoRatio;
  const legs = ratios.upperLegRatio + ratios.lowerLegRatio;

  const box = (scaleX: number, scaleY: number, y: number): GarmentTransform => ({
    x: center - scaleX / 2,
    y,
    scaleX,
    scaleY,
    rotation: 0,
  });

  switch (category) {
    case 'top':
      return box(ratios.shoulderWidthRatio * 1.2, torso * 1.08, head * 0.92);
    case 'bottom':
      return box(ratios.hipWidthRatio * 1.25, legs * 0.98, head + torso * 0.92);
    case 'outerwear':
      return box(ratios.shoulderWidthRatio * 1.45, torso * 1.25, head * 0.8);
    case 'dress':
      return box(
        Math.max(ratios.shoulderWidthRatio, ratios.hipWidthRatio) * 1.3,
        torso + legs * 0.92,
        head * 0.9,
      );
  }
}

/** Percentages of the silhouette element, which must use the body aspect ratio. */
export function overlayFrame(transform: GarmentTransform, aspectRatio: number): OverlayFrame {
  const aspect = aspectRatio > 0 ? aspectRatio : DEFAULT_BODY_ASPECT;
  return {
    leftPct: (transform.x / aspect) * 100,
    topPct: transform.y * 100,
    widthPct: (transform.scaleX / aspect) * 100,
    heightPct: transform.scaleY * 100,
  };
}
