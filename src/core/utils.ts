export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// Round a zoom factor to two decimals, then clamp to its allowed range. Shared
// by the plan gantt zoom and the graph viewport so both round/clamp identically.
export function clampZoom(value: number, min: number, max: number): number {
  return clamp(Math.round(value * 100) / 100, min, max);
}

export function asArray<T>(value: T[] | readonly T[] | undefined | null): T[] {
  return Array.isArray(value) ? [...value] : [];
}

export function unique<T>(values: T[]): T[] {
  return [...new Set(values.filter(Boolean))];
}

export function compactString(value: unknown): string {
  return String(value ?? '').trim();
}

export function compactStrings(values: unknown[]): string[] {
  return values.map(compactString).filter(Boolean);
}

export function compactJoin(values: unknown[], separator: string): string {
  return compactStrings(values).join(separator);
}

export function compactItems<T>(
  values: readonly (T | null | undefined | false)[],
): T[] {
  return values.filter((value): value is T => Boolean(value));
}

export function uniqueCompactStrings(
  values: unknown[],
  limit?: number,
): string[] {
  const result = Array.from(new Set(compactStrings(values)));
  return limit == null ? result : result.slice(0, limit);
}

// Trim a label and ellipsize it past maxLength (default 22), e.g. for compact
// book "short" names. Shared by the AI-proposal and book-metadata apply paths.
export function shortenLabel(value: string, maxLength = 22): string {
  const trimmed = value.trim();
  return trimmed.length <= maxLength
    ? trimmed
    : `${trimmed.slice(0, maxLength - 3).trimEnd()}...`;
}

export function safeNumber(value: unknown, fallback: number): number {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function round1(value: number): number {
  return Math.round((safeNumber(value, 0) + Number.EPSILON) * 10) / 10;
}

export function round2(value: number): number {
  return Math.round((safeNumber(value, 0) + Number.EPSILON) * 100) / 100;
}

export function mean(values: number[]): number {
  return values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : 0;
}

export function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function maxOr(values: number[], fallback: number): number {
  return values.length ? Math.max(...values) : fallback;
}

export function minOr(values: number[], fallback: number): number {
  return values.length ? Math.min(...values) : fallback;
}

export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
