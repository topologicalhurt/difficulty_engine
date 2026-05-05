import { clamp } from '../../core/utils';

const FLAT_RANGE_EPSILON = 1e-9;
const NEUTRAL_RANGE_PERCENT = 0.5;

export function hashText(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function gradientColor(
  percent: number,
  startHue: number,
  endHue: number,
  lightness = 56,
): string {
  const bounded = clamp(percent, 0, 1);
  const colorHue = startHue + (endHue - startHue) * bounded;
  return `hsl(${Math.round(colorHue)} 72% ${lightness}%)`;
}

export function normalizedRange(values: number[], value: number): number {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return NEUTRAL_RANGE_PERCENT;
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (Math.abs(max - min) < FLAT_RANGE_EPSILON) return NEUTRAL_RANGE_PERCENT;
  return clamp((value - min) / (max - min), 0, 1);
}
