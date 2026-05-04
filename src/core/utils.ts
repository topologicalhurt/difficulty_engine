export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function asArray<T>(value: T[] | readonly T[] | undefined | null): T[] {
  return Array.isArray(value) ? [...value] : [];
}

export function unique<T>(values: T[]): T[] {
  return [...new Set(values.filter(Boolean))];
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
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
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
