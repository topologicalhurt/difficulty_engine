import type { LatentWorkloadEstimate } from './difficulty-latent';
import { clamp, mean, round2 } from './utils';
import { median } from './workload-math';

const MIN_CALIBRATION_BOOKS = 3;
const MIN_CONFIDENCE_FOR_CALIBRATION = 0.45;
const MIN_RAW_SPREAD_FOR_CALIBRATION = 0.08;
const MIN_TARGET_SPREAD = 0.85;
const MAX_TARGET_SPREAD = 2.4;
const MAX_CALIBRATION_SHIFT = 0.95;

interface CalibrationInput {
  id: string;
  estimate: LatentWorkloadEstimate;
  locked: boolean;
}

function inverseNormalApprox(percentile: number): number {
  const p = clamp(percentile, 0.001, 0.999);
  const a = [
    -39.69683028665376, 220.9460984245205, -275.9285104469687,
    138.357751867269, -30.66479806614716, 2.506628277459239,
  ];
  const b = [
    -54.47609879822406, 161.5858368580409, -155.6989798598866,
    66.80131188771972, -13.28068155288572,
  ];
  const c = [
    -0.007784894002430293, -0.3223964580411365, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    0.007784695709041462, 0.3224671290700398, 2.445134137142996,
    3.754408661907416,
  ];
  if (p < 0.02425) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p > 0.97575) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  const q = p - 0.5;
  const r = q * q;
  return (
    (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) *
    q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  );
}

export function calibrateLatentWorkloads(
  inputs: CalibrationInput[],
): Record<string, LatentWorkloadEstimate> {
  const estimates = Object.fromEntries(
    inputs.map((input) => [input.id, { ...input.estimate }]),
  );
  const eligible = inputs.filter((input) => !input.locked);
  if (eligible.length < MIN_CALIBRATION_BOOKS) return estimates;

  const rawValues = eligible.map((input) => input.estimate.latentWorkload);
  const rawSpread = Math.max(...rawValues) - Math.min(...rawValues);
  const avgConfidence = mean(
    eligible.map((input) => input.estimate.evidenceConfidence),
  );
  if (
    rawSpread < MIN_RAW_SPREAD_FOR_CALIBRATION ||
    avgConfidence < MIN_CONFIDENCE_FOR_CALIBRATION
  ) {
    return estimates;
  }

  const center = median(rawValues);
  const sorted = [...eligible].sort(
    (left, right) =>
      left.estimate.latentWorkload - right.estimate.latentWorkload ||
      left.id.localeCompare(right.id),
  );
  const targetSpread = clamp(
    rawSpread * (1 + avgConfidence) + avgConfidence * 0.55,
    MIN_TARGET_SPREAD,
    MAX_TARGET_SPREAD,
  );
  const targetStd = targetSpread / 3.1;

  sorted.forEach((input, index) => {
    const percentile = (index + 0.5) / sorted.length;
    const target = clamp(center + inverseNormalApprox(percentile) * targetStd, 1, 10);
    const confidenceBlend = clamp(
      (input.estimate.evidenceConfidence - MIN_CONFIDENCE_FOR_CALIBRATION) /
        0.55,
      0,
      0.65,
    );
    const shift = clamp(
      (target - input.estimate.latentWorkload) * confidenceBlend,
      -MAX_CALIBRATION_SHIFT,
      MAX_CALIBRATION_SHIFT,
    );
    if (Math.abs(shift) < 0.01) return;
    estimates[input.id] = {
      ...input.estimate,
      latentWorkload: round2(clamp(input.estimate.latentWorkload + shift, 1, 10)),
      reasons: [
        ...input.estimate.reasons,
        `Evidence-calibrated cohort prior adjusts latent workload by ${round2(shift)} without changing rank order.`,
      ],
    };
  });

  return estimates;
}
