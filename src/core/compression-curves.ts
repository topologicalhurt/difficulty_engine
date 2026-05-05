import type { CompressCurve } from './types';
import { clamp, safeNumber } from './utils';

const TANH_STEEPNESS = 3.2;
const LOGISTIC_STEEPNESS = 10;
const CURVE_EPSILON = 1e-6;

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}

function inverseSmoothstep(value: number): number {
  return 0.5 - Math.sin(Math.asin(1 - 2 * value) / 3);
}

function tanhCurve(value: number): number {
  const lo = Math.tanh(-TANH_STEEPNESS / 2);
  const hi = Math.tanh(TANH_STEEPNESS / 2);
  return (Math.tanh((value - 0.5) * TANH_STEEPNESS) - lo) / (hi - lo);
}

function inverseTanhCurve(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  const lo = Math.tanh(-TANH_STEEPNESS / 2);
  const hi = Math.tanh(TANH_STEEPNESS / 2);
  const target =
    clamp(value, CURVE_EPSILON, 1 - CURVE_EPSILON) * (hi - lo) + lo;
  return clamp(0.5 + Math.atanh(target) / TANH_STEEPNESS, 0, 1);
}

function sineCurve(value: number): number {
  return (1 - Math.cos(Math.PI * value)) / 2;
}

function inverseSineCurve(value: number): number {
  return Math.acos(1 - 2 * clamp(value, 0, 1)) / Math.PI;
}

function logisticRaw(value: number): number {
  return 1 / (1 + Math.exp(-LOGISTIC_STEEPNESS * (value - 0.5)));
}

function logisticCurve(value: number): number {
  const lo = logisticRaw(0);
  const hi = logisticRaw(1);
  return (logisticRaw(value) - lo) / (hi - lo);
}

function inverseLogisticCurve(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  const lo = logisticRaw(0);
  const hi = logisticRaw(1);
  const target =
    clamp(value, CURVE_EPSILON, 1 - CURVE_EPSILON) * (hi - lo) + lo;
  return clamp(
    0.5 + Math.log(target / (1 - target)) / LOGISTIC_STEEPNESS,
    0,
    1,
  );
}

function baseCurve(
  value: number,
  curve: CompressCurve,
  intensity: number,
): number {
  switch (curve) {
    case 'linear':
      return value;
    case 'inverse_power':
      return Math.pow(value, 1 / intensity);
    case 'smoothstep':
      return Math.pow(smoothstep(value), intensity);
    case 'inverse_smoothstep':
      return Math.pow(inverseSmoothstep(value), intensity);
    case 'tanh':
      return Math.pow(tanhCurve(value), intensity);
    case 'inverse_tanh':
      return Math.pow(inverseTanhCurve(value), intensity);
    case 'sine':
      return Math.pow(sineCurve(value), intensity);
    case 'inverse_sine':
      return Math.pow(inverseSineCurve(value), intensity);
    case 'logistic':
      return Math.pow(logisticCurve(value), intensity);
    case 'inverse_logistic':
      return Math.pow(inverseLogisticCurve(value), intensity);
    case 'power':
    default:
      return Math.pow(value, intensity);
  }
}

export function applyCompressionCurve(
  value: number,
  curve: CompressCurve,
  exponent: number,
): number {
  const t = clamp(value, 0, 1);
  const intensity = Math.max(0.1, safeNumber(exponent, 1));
  return clamp(baseCurve(t, curve, intensity), 0, 1);
}
