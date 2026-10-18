import { z } from 'zod';

/**
 * Body reconstruction produced from one photograph.
 *
 * Coordinate system (normalized body space):
 * - The origin is the top-left of `normalizedBounds` in the source image.
 * - `y` is a fraction of the silhouette height: 0 at the top of the person, 1 at the bottom.
 * - `x` is also divided by silhouette height, not by width. A shoulder span of 0.28 is
 *   28% of body height. This keeps the photo's aspect ratio. Do not remap x into 0..1
 *   independently of y, or the figure will be stretched.
 * - `normalizedBounds` is the person's bounding box in source-image pixels.
 * - Landmark points, when present, use this same normalized body space.
 *   They are estimates from the visible outline. Missing landmarks must be omitted,
 *   never filled with zeros.
 *
 * A reconstruction is a 2D silhouette plus proportion estimates. It is not a 3D scan
 * and it does not yield absolute centimetre measurements from one uncalibrated photo.
 */

export const RECONSTRUCTION_LIMITATION =
  'This silhouette is a 2D outline from one photo. It keeps the visible proportions of the person in frame. It is not a 3D body scan, and a single uncalibrated photo cannot produce absolute measurements in centimeters.';

export const FULL_BODY_GUIDANCE =
  'Use one full-body, front-facing photo. Stand in an A-pose against a plain background, with space around your head and feet.';

export const NormalizedPointSchema = z.tuple([z.number().finite(), z.number().finite()]);

export const LandmarksSchema = z.object({
  shoulders: z.array(NormalizedPointSchema).max(4).optional(),
  hips: z.array(NormalizedPointSchema).max(4).optional(),
  elbows: z.array(NormalizedPointSchema).max(4).optional(),
  wrists: z.array(NormalizedPointSchema).max(4).optional(),
  knees: z.array(NormalizedPointSchema).max(4).optional(),
  ankles: z.array(NormalizedPointSchema).max(4).optional(),
  head: NormalizedPointSchema.optional(),
});

export const ProportionsSchema = z.object({
  torsoRatio: z.number().positive().max(1.5).optional(),
  upperLegRatio: z.number().positive().max(1.5).optional(),
  lowerLegRatio: z.number().positive().max(1.5).optional(),
  armRatio: z.number().positive().max(1.5).optional(),
  shoulderWidthRatio: z.number().positive().max(1.5).optional(),
  hipWidthRatio: z.number().positive().max(1.5).optional(),
  headRatio: z.number().positive().max(1.5).optional(),
});

export const SilhouetteSchema = z.object({
  format: z.enum(['svg', 'png']),
  data: z.string().min(1).max(500_000),
  width: z.number().positive().finite(),
  height: z.number().positive().finite(),
});

export const NormalizedBoundsSchema = z.object({
  x: z.number().nonnegative().finite(),
  y: z.number().nonnegative().finite(),
  width: z.number().positive().finite(),
  height: z.number().positive().finite(),
});

export const ReconstructionQualitySchema = z.object({
  status: z.enum(['ok', 'warning']),
  messages: z.array(z.string()),
  /** Which segmenter produced the mask. `fallback` is the offline path. */
  source: z.enum(['opencv', 'fallback']),
});

export const BodyReconstructionSchema = z
  .object({
    id: z.uuid(),
    imageWidth: z.number().int().positive(),
    imageHeight: z.number().int().positive(),
    silhouette: SilhouetteSchema,
    normalizedBounds: NormalizedBoundsSchema,
    landmarks: LandmarksSchema.optional(),
    proportions: ProportionsSchema.optional(),
    quality: ReconstructionQualitySchema,
    limitations: z.array(z.string().min(1)).min(1).default([RECONSTRUCTION_LIMITATION]),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .superRefine((value, ctx) => {
    const bounds = value.normalizedBounds;
    if (
      bounds.x + bounds.width > value.imageWidth + 1 ||
      bounds.y + bounds.height > value.imageHeight + 1
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'normalizedBounds must lie inside the source image',
        path: ['normalizedBounds'],
      });
    }
    const boundsAspect = bounds.width / bounds.height;
    const silhouetteAspect = value.silhouette.width / value.silhouette.height;
    if (Math.abs(boundsAspect - silhouetteAspect) > 0.02) {
      ctx.addIssue({
        code: 'custom',
        message: 'silhouette aspect ratio must match normalizedBounds',
        path: ['silhouette'],
      });
    }
  });

export type NormalizedPoint = z.infer<typeof NormalizedPointSchema>;
export type Landmarks = z.infer<typeof LandmarksSchema>;
export type Proportions = z.infer<typeof ProportionsSchema>;
export type Silhouette = z.infer<typeof SilhouetteSchema>;
export type NormalizedBounds = z.infer<typeof NormalizedBoundsSchema>;
export type ReconstructionQuality = z.infer<typeof ReconstructionQualitySchema>;
export type BodyReconstruction = z.infer<typeof BodyReconstructionSchema>;

/** Row-major person mask. 1 is the person, 0 is the background. Length is width * height. */
export type BinaryMask = {
  width: number;
  height: number;
  data: Uint8Array;
};

/** RGBA bitmap. `data.length` is width * height * 4. */
export type RgbaImage = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export function frameAspect(bounds: Pick<NormalizedBounds, 'width' | 'height'>): number {
  return bounds.width / bounds.height;
}
