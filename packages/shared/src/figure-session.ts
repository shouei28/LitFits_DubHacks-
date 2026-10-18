import { z } from 'zod';
import { BodyReconstructionSchema } from './reconstruction';
import { CategorySchema } from './schemas';

/**
 * Persisted studio session. Dismiss hides the figure and keeps the reconstruction
 * and worn garments so Restore can bring them back. Clear deletes the reconstruction
 * and the clothes on it; saved outfits stay.
 */

export const DISMISS_FIGURE_EXPLANATION =
  'Dismiss hides the figure on every page. The reconstruction and outfit stay saved on this device until you clear them or replace the photo. Restore brings the same figure back.';

export const CLEAR_FIGURE_EXPLANATION =
  'Clear figure deletes the reconstruction and the clothes currently on it from this device. Saved outfits are kept.';

export const FIGURE_STORAGE_KEY = 'fitmirror-figure-v1';

export const FigureCornerSchema = z.enum(['bottom-right', 'bottom-left', 'top-right', 'top-left']);

export const FigureAnchorSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

export const FigureChromeSchema = z.object({
  dismissed: z.boolean(),
  minimized: z.boolean(),
  corner: FigureCornerSchema,
  /** When set, the card's top-left is this fraction of the viewport. Overrides `corner`. */
  anchor: FigureAnchorSchema.nullable(),
});

export const GarmentTransformSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  scaleX: z.number().positive().finite(),
  scaleY: z.number().positive().finite(),
  rotation: z.number().finite(),
});

export const OverlayKindSchema = z.enum(['schematic', 'transparent', 'none']);

export const WornGarmentSchema = z
  .object({
    productId: z.string().min(1),
    category: CategorySchema,
    layerOrder: z.number().int().min(0).max(9),
    size: z.string().min(1).nullable(),
    title: z.string().min(1),
    color: z.string().nullable(),
    source: z.string().min(1),
    transform: GarmentTransformSchema,
    overlayHref: z.string().min(1).nullable(),
    overlayKind: OverlayKindSchema,
  })
  .superRefine((value, ctx) => {
    if (value.overlayKind === 'transparent' && value.overlayHref === null) {
      ctx.addIssue({
        code: 'custom',
        message: 'transparent overlays need overlayHref',
        path: ['overlayHref'],
      });
    }
  });

export const SavedOutfitSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(80),
  garments: z.array(WornGarmentSchema),
  createdAt: z.iso.datetime({ offset: true }),
});

export const FigurePersistedSchema = z.object({
  reconstruction: BodyReconstructionSchema.nullable(),
  worn: z.array(WornGarmentSchema),
  savedOutfits: z.array(SavedOutfitSchema),
  chrome: FigureChromeSchema,
});

export type FigurePersisted = z.infer<typeof FigurePersistedSchema>;

export type FigureCorner = z.infer<typeof FigureCornerSchema>;
export type FigureAnchor = z.infer<typeof FigureAnchorSchema>;
export type FigureChrome = z.infer<typeof FigureChromeSchema>;
export type GarmentTransform = z.infer<typeof GarmentTransformSchema>;
export type OverlayKind = z.infer<typeof OverlayKindSchema>;
export type WornGarment = z.infer<typeof WornGarmentSchema>;
export type SavedOutfit = z.infer<typeof SavedOutfitSchema>;

export const DEFAULT_CHROME: FigureChrome = {
  dismissed: false,
  minimized: false,
  corner: 'bottom-right',
  anchor: null,
};
