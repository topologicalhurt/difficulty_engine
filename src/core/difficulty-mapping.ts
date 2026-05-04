import type { ConstraintSet } from './types';
import { clamp, round1, safeNumber } from './utils';
import { applyCompressionCurve } from './compression-curves';

const RAW_DIFFICULTY_MIN = 1;
const RAW_DIFFICULTY_MAX = 10;
const RAW_DIFFICULTY_SPAN = RAW_DIFFICULTY_MAX - RAW_DIFFICULTY_MIN;
const FLAT_DISTRIBUTION_EPSILON = 0.001;
const DEFAULT_CURVE_FLOOR_POINT = 0;
const DEFAULT_CURVE_CEILING_POINT = 1;
const MIN_CURVE_WINDOW = 0.1;

export interface DifficultyDistributionStats {
  min: number;
  median: number;
  max: number;
  spread: number;
}

export function difficultyDistributionStats(scores: number[]): DifficultyDistributionStats {
  const sorted = scores
    .map((score) => clamp(safeNumber(score, 5), RAW_DIFFICULTY_MIN, RAW_DIFFICULTY_MAX))
    .sort((left, right) => left - right);
  if (!sorted.length) {
    return { min: 5, median: 5, max: 5, spread: 0 };
  }
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 ? sorted[mid] : ((sorted[mid - 1] ?? 5) + (sorted[mid] ?? 5)) / 2;
  const min = sorted[0] ?? 5;
  const max = sorted[sorted.length - 1] ?? 5;
  return { min, median, max, spread: max - min };
}

export function normalizedCurveWindow(constraints: ConstraintSet): { floorPoint: number; ceilingPoint: number } {
  const floorPoint = clamp(
    safeNumber(constraints.diffCurveFloorPoint, DEFAULT_CURVE_FLOOR_POINT),
    0,
    0.45,
  );
  const rawCeilingPoint = clamp(
    safeNumber(constraints.diffCurveCeilingPoint, DEFAULT_CURVE_CEILING_POINT),
    0.55,
    1,
  );
  return {
    floorPoint,
    ceilingPoint: Math.max(rawCeilingPoint, floorPoint + MIN_CURVE_WINDOW),
  };
}

function shapedPercentile(
  percentile: number,
  constraints: ConstraintSet,
): number {
  const { floorPoint, ceilingPoint } = normalizedCurveWindow(constraints);
  let shaped = clamp((percentile - floorPoint) / Math.max(MIN_CURVE_WINDOW, ceilingPoint - floorPoint), 0, 1);
  if (
    constraints.compressMode === 'manual' ||
    (constraints.compressMode === 'auto' && constraints.diffMapMode === 'scaled')
  ) {
    shaped = applyCompressionCurve(
      shaped,
      constraints.compressCurve || 'power',
      constraints.compressExp,
    );
  }
  return Math.pow(shaped, Math.max(0.1, safeNumber(constraints.diffRamp, 1)));
}

export function mapDisplayDifficulty(
  rawScore: number,
  constraints: ConstraintSet,
  stats: DifficultyDistributionStats,
): number {
  const safeRaw = clamp(safeNumber(rawScore, 5), RAW_DIFFICULTY_MIN, RAW_DIFFICULTY_MAX);
  const useScaled =
    constraints.diffMapMode === 'scaled' && stats.spread > FLAT_DISTRIBUTION_EPSILON;
  const percentile = useScaled
    ? (safeRaw - stats.min) / stats.spread
    : (safeRaw - RAW_DIFFICULTY_MIN) / RAW_DIFFICULTY_SPAN;
  const shaped = shapedPercentile(percentile, constraints);
  const outputMin = useScaled
    ? clamp(safeNumber(constraints.diffMapMin, RAW_DIFFICULTY_MIN), RAW_DIFFICULTY_MIN, RAW_DIFFICULTY_MAX)
    : RAW_DIFFICULTY_MIN;
  const outputMax = useScaled
    ? clamp(safeNumber(constraints.diffMapMax, RAW_DIFFICULTY_MAX), outputMin, RAW_DIFFICULTY_MAX)
    : RAW_DIFFICULTY_MAX;
  return round1(clamp(outputMin + shaped * (outputMax - outputMin), RAW_DIFFICULTY_MIN, RAW_DIFFICULTY_MAX));
}
