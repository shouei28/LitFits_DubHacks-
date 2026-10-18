import {
  BodyReconstructionSchema,
  FULL_BODY_GUIDANCE,
  RECONSTRUCTION_LIMITATION,
  type BinaryMask,
  type BodyReconstruction,
  type RgbaImage,
} from '@fitmirror/shared';
import { estimateProportions } from './proportions';
import { segmentFallback, type SegmentResult } from './segment-fallback';
import { silhouetteFromMask } from './silhouette';

export const NO_PERSON_MESSAGE =
  'No person was found. Use a full-body photo against a plain background.';

export const STEP_BACK_MESSAGE =
  'The person fills the photo. Step back so there is space around the body.';

export const SMALL_SUBJECT_MESSAGE =
  'The person is small in the frame. Move closer while keeping the whole body visible.';

export const TOUCHES_EDGE_MESSAGE =
  'The body touches the edge of the photo. Leave space around the head and feet.';

export const MULTIPLE_SHAPES_MESSAGE =
  'More than one object was found. The largest shape was used.';

export const LOW_RESOLUTION_MESSAGE =
  'This photo is low resolution. A sharper full-body photo gives a better outline.';

export const WIDE_OUTLINE_MESSAGE =
  'The outline is wider than a standing front view. Face the camera with arms slightly away from the body.';

/** Foreground covering more than this fraction of the frame is too close. */
export const MAX_FOREGROUND_COVERAGE = 0.9;

const MIN_SUBJECT_HEIGHT = 0.45;
const MIN_SHORT_SIDE = 240;
const MAX_BODY_ASPECT = 0.9;

export type ReconstructionResult =
  { ok: true; reconstruction: BodyReconstruction } | { ok: false; messages: string[] };

export type Segmenter = (image: RgbaImage) => Promise<{
  mask: BinaryMask;
  source: 'opencv' | 'fallback';
  significantComponentCount?: number;
}>;

/**
 * Photo to silhouette. Pass `segmenter` in tests so the default OpenCV import never runs.
 * Rejected photos return `{ ok: false }` and are not a reconstruction.
 */
export async function reconstructFromRgba(
  image: RgbaImage,
  options?: {
    segmenter?: Segmenter;
    now?: Date;
    id?: string;
  },
): Promise<ReconstructionResult> {
  try {
    if (!isUsableImage(image)) return rejected('The photo data is invalid.');

    const segmenter = options?.segmenter ?? defaultSegmenter;
    let segmented: SegmentResult;
    try {
      const result = await segmenter(image);
      segmented = {
        mask: result.mask,
        source: result.source,
        significantComponentCount: result.significantComponentCount ?? 1,
      };
    } catch (error) {
      const detail =
        error instanceof Error && error.message
          ? error.message
          : 'The photo could not be segmented.';
      return rejected(detail);
    }

    if (
      !segmented.mask ||
      segmented.mask.width !== image.width ||
      segmented.mask.height !== image.height ||
      segmented.mask.data.length !== image.width * image.height
    ) {
      return rejected('The photo could not be segmented.');
    }

    const bounds = tightBounds(segmented.mask);
    const foregroundCount = countForeground(segmented.mask);
    if (!bounds || foregroundCount === 0) return rejected(NO_PERSON_MESSAGE);
    if (foregroundCount > MAX_FOREGROUND_COVERAGE * image.width * image.height) {
      return rejected(STEP_BACK_MESSAGE);
    }

    const { proportions, landmarks } = estimateProportions(segmented.mask, bounds);
    const silhouette = silhouetteFromMask(segmented.mask, bounds);
    const messages = qualityMessages(image, bounds, segmented.significantComponentCount);
    const createdAt = (options?.now ?? new Date()).toISOString();

    const parsed = BodyReconstructionSchema.safeParse({
      id: options?.id ?? crypto.randomUUID(),
      imageWidth: image.width,
      imageHeight: image.height,
      silhouette,
      normalizedBounds: bounds,
      landmarks,
      proportions,
      quality: {
        status: messages.length > 0 ? 'warning' : 'ok',
        messages,
        source: segmented.source,
      },
      limitations: [RECONSTRUCTION_LIMITATION],
      createdAt,
    });
    if (!parsed.success) {
      const detail = parsed.error.issues.map((issue) => issue.message).join(' ');
      return rejected(detail || 'The silhouette could not be built from this photo.');
    }
    return { ok: true, reconstruction: parsed.data };
  } catch (error) {
    const detail =
      error instanceof Error && error.message ? error.message : 'The photo could not be read.';
    return rejected(detail);
  }
}

async function defaultSegmenter(image: RgbaImage): Promise<SegmentResult> {
  try {
    const opencv = await import('../opencv/segment-opencv');
    const result = await opencv.segmentOpenCv(image);
    if (result && result.significantComponentCount > 0) return result;
  } catch {
    // OpenCV is optional. A missing module or a runtime failure still segments offline.
  }
  return segmentFallback(image);
}

function rejected(message: string): ReconstructionResult {
  const messages = message === FULL_BODY_GUIDANCE ? [message] : [message, FULL_BODY_GUIDANCE];
  return { ok: false, messages };
}

function isUsableImage(image: RgbaImage): boolean {
  return Boolean(
    image &&
    Number.isInteger(image.width) &&
    Number.isInteger(image.height) &&
    image.width >= 1 &&
    image.height >= 1 &&
    image.data &&
    image.data.length === image.width * image.height * 4,
  );
}

function countForeground(mask: BinaryMask): number {
  let count = 0;
  for (let index = 0; index < mask.data.length; index++) {
    if (mask.data[index] === 1) count += 1;
  }
  return count;
}

function tightBounds(
  mask: BinaryMask,
): { x: number; y: number; width: number; height: number } | null {
  let minX = mask.width;
  let minY = mask.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < mask.height; y++) {
    const row = y * mask.width;
    for (let x = 0; x < mask.width; x++) {
      if (mask.data[row + x] !== 1) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0 || maxY < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function qualityMessages(
  image: RgbaImage,
  bounds: { x: number; y: number; width: number; height: number },
  significantComponentCount: number,
): string[] {
  const messages: string[] = [];
  if (bounds.height < MIN_SUBJECT_HEIGHT * image.height) messages.push(SMALL_SUBJECT_MESSAGE);
  if (
    bounds.x === 0 ||
    bounds.y === 0 ||
    bounds.x + bounds.width === image.width ||
    bounds.y + bounds.height === image.height
  ) {
    messages.push(TOUCHES_EDGE_MESSAGE);
  }
  if (significantComponentCount > 1) messages.push(MULTIPLE_SHAPES_MESSAGE);
  if (Math.min(image.width, image.height) < MIN_SHORT_SIDE) messages.push(LOW_RESOLUTION_MESSAGE);
  if (bounds.width > MAX_BODY_ASPECT * bounds.height) messages.push(WIDE_OUTLINE_MESSAGE);
  return messages;
}
