import type { RgbaImage } from '@fitmirror/shared';
import { speckThreshold, type SegmentResult } from '../reconstruction/segment-fallback';
import { loadOpenCv, type OpenCvMat } from './opencv-loader';

/** Grayscale distance from the border median. Named separately from the RGB fallback threshold. */
const BORDER_GRAY_DISTANCE = 36;

/**
 * Browser segmenter. Do not import this file from unit tests.
 * Border-background subtraction, then the largest external contour.
 * Every cv.Mat is deleted in `finally`.
 */
export async function segmentOpenCv(image: RgbaImage): Promise<SegmentResult | null> {
  const cv = await loadOpenCv();
  if (!cv) return null;
  const trash: Array<{ delete(): void }> = [];
  const keep = <T extends { delete(): void }>(mat: T): T => {
    trash.push(mat);
    return mat;
  };

  try {
    const src = keep(new cv.Mat(image.height, image.width, cv.CV_8UC4));
    src.data.set(image.data);
    const gray = keep(new cv.Mat(image.height, image.width, cv.CV_8UC1));
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    const level = medianBorderGray(gray, image.width, image.height);
    const background = keep(
      new cv.Mat(image.height, image.width, cv.CV_8UC1, new cv.Scalar(level)),
    );
    const diff = keep(new cv.Mat());
    cv.absdiff(gray, background, diff);
    const binary = keep(new cv.Mat());
    cv.threshold(diff, binary, BORDER_GRAY_DISTANCE, 255, cv.THRESH_BINARY);

    const contourInput = keep(binary.clone());
    const contours = keep(new cv.MatVector());
    const hierarchy = keep(new cv.Mat());
    cv.findContours(contourInput, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const threshold = speckThreshold(image.width * image.height);
    let significantComponentCount = 0;
    let largestIndex = -1;
    let largestArea = 0;
    for (let index = 0; index < contours.size(); index++) {
      const contour = contours.get(index);
      trash.push(contour);
      const area = cv.contourArea(contour);
      if (area < threshold) continue;
      significantComponentCount += 1;
      if (area > largestArea) {
        largestArea = area;
        largestIndex = index;
      }
    }

    const mask = new Uint8Array(image.width * image.height);
    if (largestIndex >= 0) {
      const filled = keep(cv.Mat.zeros(image.height, image.width, cv.CV_8UC1));
      cv.drawContours(filled, contours, largestIndex, new cv.Scalar(255), cv.FILLED ?? -1);
      copyMask(filled, mask, image.width, image.height);
    }

    return {
      mask: { width: image.width, height: image.height, data: mask },
      source: 'opencv',
      significantComponentCount,
    };
  } finally {
    for (let index = trash.length - 1; index >= 0; index--) {
      try {
        trash[index]?.delete();
      } catch {
        // A MatVector may already have released a contour Mat.
      }
    }
  }
}

function medianBorderGray(gray: OpenCvMat, width: number, height: number): number {
  const samples: number[] = [];
  const at = (x: number, y: number) => gray.ucharPtr(y, x)[0] ?? 0;
  for (let x = 0; x < width; x++) {
    samples.push(at(x, 0));
    if (height > 1) samples.push(at(x, height - 1));
  }
  for (let y = 1; y < height - 1; y++) {
    samples.push(at(0, y));
    if (width > 1) samples.push(at(width - 1, y));
  }
  samples.sort((a, b) => a - b);
  const mid = Math.floor(samples.length / 2);
  if (samples.length % 2 === 0)
    return Math.round(((samples[mid - 1] ?? 0) + (samples[mid] ?? 0)) / 2);
  return samples[mid] ?? 0;
}

function copyMask(filled: OpenCvMat, mask: Uint8Array, width: number, height: number): void {
  if (filled.isContinuous() && filled.data.length >= mask.length) {
    for (let index = 0; index < mask.length; index++) {
      if ((filled.data[index] ?? 0) > 0) mask[index] = 1;
    }
    return;
  }
  for (let y = 0; y < height; y++) {
    const row = filled.ucharPtr(y);
    for (let x = 0; x < width; x++) {
      if ((row[x] ?? 0) > 0) mask[y * width + x] = 1;
    }
  }
}
