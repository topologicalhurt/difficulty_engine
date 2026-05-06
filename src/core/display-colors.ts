import { clamp } from './utils';

const FLAT_RANGE_EPSILON = 1e-9;
const NEUTRAL_RANGE_PERCENT = 0.5;
const DEFAULT_GROUP_HUE_START = 0;
const DEFAULT_GROUP_HUE_SPAN = 360;
const DEFAULT_GROUP_SATURATION = 72;
const DEFAULT_GROUP_LIGHTNESS = 58;
const DEFAULT_GRADIENT_SATURATION = 72;
const DEFAULT_GRADIENT_LIGHTNESS = 56;

export interface GroupColorOptions {
  fallback?: string;
  hueStart?: number;
  hueSpan?: number;
  saturation?: number;
  lightness?: number;
}

export function hashText(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function hslColor(
  hue: number,
  saturation: number,
  lightness: number,
): string {
  return `hsl(${Math.round(hue)} ${saturation}% ${lightness}%)`;
}

export function groupColor(
  group: string,
  options: GroupColorOptions = {},
): string {
  const hueStart = options.hueStart ?? DEFAULT_GROUP_HUE_START;
  const hueSpan = options.hueSpan ?? DEFAULT_GROUP_HUE_SPAN;
  const label = group || options.fallback || '';
  const hue = hueStart + (hashText(label) % hueSpan);
  return hslColor(
    hue,
    options.saturation ?? DEFAULT_GROUP_SATURATION,
    options.lightness ?? DEFAULT_GROUP_LIGHTNESS,
  );
}

export function gradientColor(
  percent: number,
  startHue: number,
  endHue: number,
  lightness = DEFAULT_GRADIENT_LIGHTNESS,
): string {
  const bounded = clamp(percent, 0, 1);
  const hue = startHue + (endHue - startHue) * bounded;
  return hslColor(hue, DEFAULT_GRADIENT_SATURATION, lightness);
}

export function normalizedRange(values: number[], value: number): number {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return NEUTRAL_RANGE_PERCENT;
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (Math.abs(max - min) < FLAT_RANGE_EPSILON) {
    return NEUTRAL_RANGE_PERCENT;
  }
  return clamp((value - min) / (max - min), 0, 1);
}
