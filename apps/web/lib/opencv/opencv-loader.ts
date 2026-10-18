/**
 * Loads OpenCV in the browser only. The import sits inside this function so unit tests
 * that never call it do not pull the module into Vitest.
 */

export type OpenCvModule = {
  Mat: {
    new (): OpenCvMat;
    new (rows: number, cols: number, type: number, scalar?: unknown): OpenCvMat;
    zeros(rows: number, cols: number, type: number): OpenCvMat;
  };
  MatVector: new () => OpenCvMatVector;
  Scalar: new (v0: number, v1?: number, v2?: number, v3?: number) => unknown;
  CV_8UC1: number;
  CV_8UC4: number;
  COLOR_RGBA2GRAY: number;
  THRESH_BINARY: number;
  RETR_EXTERNAL: number;
  CHAIN_APPROX_SIMPLE: number;
  FILLED?: number;
  cvtColor(src: OpenCvMat, dst: OpenCvMat, code: number): void;
  absdiff(src1: OpenCvMat, src2: OpenCvMat, dst: OpenCvMat): void;
  threshold(src: OpenCvMat, dst: OpenCvMat, thresh: number, maxval: number, type: number): void;
  findContours(
    image: OpenCvMat,
    contours: OpenCvMatVector,
    hierarchy: OpenCvMat,
    mode: number,
    method: number,
  ): void;
  contourArea(contour: OpenCvMat): number;
  drawContours(
    image: OpenCvMat,
    contours: OpenCvMatVector,
    contourIdx: number,
    color: unknown,
    thickness: number,
  ): void;
  onRuntimeInitialized?: () => void;
};

export type OpenCvMat = {
  data: Uint8Array;
  rows: number;
  cols: number;
  isContinuous(): boolean;
  ucharPtr(row: number, col?: number): Uint8Array;
  clone(): OpenCvMat;
  delete(): void;
};

export type OpenCvMatVector = {
  size(): number;
  get(index: number): OpenCvMat;
  delete(): void;
};

let loading: Promise<OpenCvModule | null> | null = null;

export function loadOpenCv(): Promise<OpenCvModule | null> {
  loading ??= initialize().catch(() => null);
  return loading;
}

async function initialize(): Promise<OpenCvModule | null> {
  try {
    const imported: unknown = await import('@techstark/opencv-js');
    const cv = await unwrap(imported);
    if (!cv) return null;
    await waitUntilReady(cv);
    if (typeof cv.Mat !== 'function' || typeof cv.cvtColor !== 'function') return null;
    return cv;
  } catch {
    return null;
  }
}

async function unwrap(imported: unknown): Promise<OpenCvModule | null> {
  let current = imported;
  if (isRecord(current) && 'default' in current) current = current.default;
  if (typeof current === 'function') {
    current = await (current as () => unknown)();
  }
  if (isPromise(current)) current = await current;
  return isOpenCv(current) ? current : null;
}

function isOpenCv(value: unknown): value is OpenCvModule {
  return isRecord(value) && ('Mat' in value || 'onRuntimeInitialized' in value);
}

async function waitUntilReady(cv: OpenCvModule): Promise<void> {
  if (typeof cv.Mat === 'function') return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('OpenCV timed out')), 10_000);
    cv.onRuntimeInitialized = () => {
      clearTimeout(timer);
      resolve();
    };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPromise(value: unknown): value is Promise<unknown> {
  return isRecord(value) && typeof value.then === 'function';
}
