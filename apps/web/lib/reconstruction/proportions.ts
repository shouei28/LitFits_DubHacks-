import type { BinaryMask, Landmarks, NormalizedPoint, Proportions } from '@fitmirror/shared';
import type { PixelBounds } from './segment-fallback';

type Run = { start: number; end: number };

const RATIO_MAX = 1.5;

/**
 * Proportion estimates from the full-resolution mask.
 * Widths use the central run so a separated arm is not counted as shoulder or hip.
 * Ratios are fractions of the person-box height. Nothing here is a centimetre measurement.
 */
export function estimateProportions(
  mask: BinaryMask,
  bounds: PixelBounds,
): { proportions?: Proportions; landmarks?: Landmarks } {
  const midline = bounds.x + bounds.width / 2;
  const proportions: Proportions = {};
  const landmarks: Landmarks = {};

  const shoulder = widestCentralRun(mask, bounds, midline, 0.12, 0.4);
  const hip = widestCentralRun(mask, bounds, midline, 0.45, 0.7);

  if (shoulder) {
    assignRatio(proportions, 'headRatio', (shoulder.y - bounds.y) / bounds.height);
    assignRatio(
      proportions,
      'shoulderWidthRatio',
      (shoulder.run.end - shoulder.run.start) / bounds.height,
    );
    const shoulders = runEnds(shoulder.run, shoulder.y, bounds);
    if (shoulders.length > 0) landmarks.shoulders = shoulders;
  }

  if (hip) {
    assignRatio(proportions, 'hipWidthRatio', (hip.run.end - hip.run.start) / bounds.height);
    const hips = runEnds(hip.run, hip.y, bounds);
    if (hips.length > 0) landmarks.hips = hips;
  }

  if (shoulder && hip && hip.y > shoulder.y) {
    assignRatio(proportions, 'torsoRatio', (hip.y - shoulder.y) / bounds.height);
  }

  const top = centralRun(runsOnRow(mask, bounds, bounds.y), midline);
  if (top) {
    const head = toPoint((top.start + top.end - 1) / 2, bounds.y, bounds);
    if (head) landmarks.head = head;
  }

  if (hip) {
    const crotchY = firstSplitRow(mask, bounds, midline, hip.y + 1);
    const ankleY = lastForegroundRow(mask, bounds);
    if (crotchY !== null && ankleY !== null && ankleY > crotchY) {
      const kneeY = narrowestLegRow(mask, bounds, midline, crotchY, ankleY);
      if (kneeY !== null && kneeY > crotchY && ankleY > kneeY) {
        assignRatio(proportions, 'upperLegRatio', (kneeY - crotchY) / bounds.height);
        assignRatio(proportions, 'lowerLegRatio', (ankleY - kneeY) / bounds.height);
        const knees = endsOfRuns(legRuns(runsOnRow(mask, bounds, kneeY), midline), kneeY, bounds);
        const ankles = endsOfRuns(runsOnRow(mask, bounds, ankleY), ankleY, bounds);
        if (knees.length > 0) landmarks.knees = knees.slice(0, 4);
        if (ankles.length > 0) landmarks.ankles = ankles.slice(0, 4);
      }
    }
  }

  const armLimit = hip ? hip.y - 1 : bounds.y + Math.floor(bounds.height * 0.45);
  const arm = separatedArm(mask, bounds, midline, armLimit);
  if (arm) {
    assignRatio(proportions, 'armRatio', arm.ratio);
    if (arm.wrists.length > 0) landmarks.wrists = arm.wrists.slice(0, 4);
  }

  return {
    proportions: Object.keys(proportions).length > 0 ? proportions : undefined,
    landmarks: hasLandmark(landmarks) ? landmarks : undefined,
  };
}

function assignRatio(target: Proportions, key: keyof Proportions, value: number): void {
  if (!Number.isFinite(value) || value <= 0 || value > RATIO_MAX) return;
  target[key] = value;
}

function hasLandmark(landmarks: Landmarks): boolean {
  return Object.values(landmarks).some((value) => value !== undefined);
}

function band(
  bounds: PixelBounds,
  startFrac: number,
  endFrac: number,
): { start: number; end: number } {
  const start = Math.max(bounds.y, Math.ceil(bounds.y + startFrac * bounds.height - 1e-6));
  const end = Math.min(
    bounds.y + bounds.height - 1,
    Math.floor(bounds.y + endFrac * bounds.height + 1e-6),
  );
  return { start, end };
}

function widestCentralRun(
  mask: BinaryMask,
  bounds: PixelBounds,
  midline: number,
  startFrac: number,
  endFrac: number,
): { y: number; run: Run } | null {
  const { start, end } = band(bounds, startFrac, endFrac);
  if (start > end) return null;
  let best: { y: number; run: Run } | null = null;
  let bestWidth = 0;
  for (let y = start; y <= end; y++) {
    const run = centralRun(runsOnRow(mask, bounds, y), midline);
    if (!run) continue;
    const width = run.end - run.start;
    if (!best || width > bestWidth) {
      best = { y, run };
      bestWidth = width;
    }
  }
  return best;
}

function runsOnRow(mask: BinaryMask, bounds: PixelBounds, y: number): Run[] {
  const runs: Run[] = [];
  const x1 = bounds.x + bounds.width;
  let x = bounds.x;
  const row = y * mask.width;
  while (x < x1) {
    if (mask.data[row + x] !== 1) {
      x += 1;
      continue;
    }
    const start = x;
    x += 1;
    while (x < x1 && mask.data[row + x] === 1) x += 1;
    runs.push({ start, end: x });
  }
  return runs;
}

function containsMidline(run: Run, midline: number): boolean {
  return run.start <= midline && midline < run.end;
}

function distanceToRun(run: Run, midline: number): number {
  if (midline < run.start) return run.start - midline;
  if (midline > run.end) return midline - run.end;
  return 0;
}

/** The foreground run that contains the midline, otherwise the nearest run. */
function centralRun(runs: Run[], midline: number): Run | null {
  let closest: Run | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const run of runs) {
    if (containsMidline(run, midline)) return run;
    const distance = distanceToRun(run, midline);
    if (distance < closestDistance) {
      closest = run;
      closestDistance = distance;
    }
  }
  return closest;
}

/** True when two runs sit on opposite sides and none of them crosses the midline. */
function splitAroundMidline(runs: Run[], midline: number): boolean {
  let left = false;
  let right = false;
  for (const run of runs) {
    if (run.start < midline && run.end > midline) return false;
    if (run.end <= midline) left = true;
    else if (run.start >= midline) right = true;
  }
  return left && right;
}

function firstSplitRow(
  mask: BinaryMask,
  bounds: PixelBounds,
  midline: number,
  startY: number,
): number | null {
  const bottom = bounds.y + bounds.height - 1;
  for (let y = startY; y <= bottom; y++) {
    if (splitAroundMidline(runsOnRow(mask, bounds, y), midline)) return y;
  }
  return null;
}

function lastForegroundRow(mask: BinaryMask, bounds: PixelBounds): number | null {
  const x1 = bounds.x + bounds.width;
  for (let y = bounds.y + bounds.height - 1; y >= bounds.y; y--) {
    const row = y * mask.width;
    for (let x = bounds.x; x < x1; x++) {
      if (mask.data[row + x] === 1) return y;
    }
  }
  return null;
}

/**
 * Knee is the narrowest split row between the crotch and the lower leg.
 * The bottom 30% of the leg is left for the ankle so a tapering foot is not called the knee.
 */
function narrowestLegRow(
  mask: BinaryMask,
  bounds: PixelBounds,
  midline: number,
  crotchY: number,
  ankleY: number,
): number | null {
  const span = ankleY - crotchY;
  if (span < 2) return null;
  const searchEnd = Math.min(ankleY - 1, crotchY + Math.max(1, Math.floor(span * 0.7)));
  let bestWidth = Number.POSITIVE_INFINITY;
  let plateauStart = -1;
  let plateauEnd = -1;
  for (let y = crotchY + 1; y <= searchEnd; y++) {
    const runs = runsOnRow(mask, bounds, y);
    if (!splitAroundMidline(runs, midline)) continue;
    const width = runs.reduce((sum, run) => sum + (run.end - run.start), 0);
    if (width <= 0) continue;
    if (width < bestWidth) {
      bestWidth = width;
      plateauStart = y;
      plateauEnd = y;
    } else if (width === bestWidth && y === plateauEnd + 1) {
      plateauEnd = y;
    }
  }
  if (plateauStart < 0) return null;
  return Math.floor((plateauStart + plateauEnd) / 2);
}

function legRuns(runs: Run[], midline: number): Run[] {
  return runs.filter((run) => run.end <= midline || run.start >= midline);
}

type SideSpan = { topY: number; topX: number; bottomY: number; bottomX: number; bottomRun: Run };

function separatedArm(
  mask: BinaryMask,
  bounds: PixelBounds,
  midline: number,
  limitY: number,
): { ratio: number; wrists: NormalizedPoint[] } | null {
  const bottom = Math.min(bounds.y + bounds.height - 1, limitY);
  const left = sideSpan(mask, bounds, midline, bottom, 'left');
  const right = sideSpan(mask, bounds, midline, bottom, 'right');
  const lengths = [left, right]
    .filter((span): span is SideSpan => span !== null)
    .map((span) => Math.hypot(span.bottomX - span.topX, span.bottomY - span.topY));
  const usable = lengths.filter((length) => length > 0);
  if (usable.length === 0) return null;
  const ratio = usable.reduce((sum, length) => sum + length, 0) / usable.length / bounds.height;
  const wrists = [left, right].flatMap((span) =>
    span ? runEnds(span.bottomRun, span.bottomY, bounds) : [],
  );
  return { ratio, wrists };
}

function sideSpan(
  mask: BinaryMask,
  bounds: PixelBounds,
  midline: number,
  limitY: number,
  side: 'left' | 'right',
): SideSpan | null {
  let span: SideSpan | null = null;
  for (let y = bounds.y; y <= limitY; y++) {
    const runs = runsOnRow(mask, bounds, y);
    const central = centralRun(runs, midline);
    const sideRuns = runs.filter((run) => {
      if (central && run.start === central.start && run.end === central.end) return false;
      return side === 'left' ? run.end <= midline : run.start >= midline;
    });
    if (sideRuns.length === 0) continue;
    const outerRun =
      side === 'left'
        ? sideRuns.reduce((best, run) => (run.start < best.start ? run : best))
        : sideRuns.reduce((best, run) => (run.end > best.end ? run : best));
    const outerX = side === 'left' ? outerRun.start : outerRun.end - 1;
    if (!span) {
      span = { topY: y, topX: outerX, bottomY: y, bottomX: outerX, bottomRun: outerRun };
    } else {
      span.bottomY = y;
      span.bottomX = outerX;
      span.bottomRun = outerRun;
    }
  }
  return span;
}

function runEnds(run: Run, y: number, bounds: PixelBounds): NormalizedPoint[] {
  return endsOfRuns([run], y, bounds);
}

function endsOfRuns(runs: Run[], y: number, bounds: PixelBounds): NormalizedPoint[] {
  const points: NormalizedPoint[] = [];
  for (const run of runs) {
    const left = toPoint(run.start, y, bounds);
    const right = toPoint(run.end - 1, y, bounds);
    if (left) points.push(left);
    if (right) points.push(right);
  }
  return points;
}

function toPoint(pixelX: number, pixelY: number, bounds: PixelBounds): NormalizedPoint | null {
  const x = (pixelX - bounds.x) / bounds.height;
  const y = (pixelY - bounds.y) / bounds.height;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [x, y];
}
