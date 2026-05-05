import { clamp, safeNumber } from './utils';

export function normalizeString(value: unknown, fallback = ''): string {
  return String(value ?? fallback).trim();
}

export function normalizeStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return values.map((value) => String(value ?? '').trim()).filter(Boolean);
}

export function normalizeBoolean(value: unknown): boolean {
  return value === true;
}

export function normalizeNumber(
  value: unknown,
  fallback: number,
  min?: number,
  max?: number,
  integer = false,
): number {
  const parsed = safeNumber(value, fallback);
  const bounded = clamp(parsed, min ?? parsed, max ?? parsed);
  return integer ? Math.round(bounded) : bounded;
}

export function normalizeDateKey(value: unknown, fallback: string): string {
  const normalized = normalizeString(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return fallback;
  const date = new Date(`${normalized}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== normalized
    ? fallback
    : normalized;
}

export function normalizeWeekdays(
  value: unknown,
  fallback: number[],
): number[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }
  const normalized = Array.from(
    new Set(
      value
        .map((entry) => Math.trunc(safeNumber(entry, Number.NaN)))
        .filter((entry) => Number.isFinite(entry) && entry >= 0 && entry <= 6),
    ),
  ).sort((left, right) => left - right);
  return normalized.length ? normalized : [...fallback];
}
