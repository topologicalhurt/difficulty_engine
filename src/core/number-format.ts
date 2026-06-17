import { safeNumber } from './utils';

export function formatOneDecimal(value: number | undefined | null): string {
  const safe = safeNumber(value, 0);
  return (Math.round((safe + Number.EPSILON) * 10) / 10).toFixed(1);
}

export function formatWholeNumber(value: number | undefined | null): string {
  return String(Math.round(safeNumber(value, 0)));
}

export function formatWholePercent(value: number | undefined | null): string {
  return `${formatWholeNumber(value)}%`;
}

export function formatRatioPercent(value: number | undefined | null): string {
  return `${formatWholeNumber(safeNumber(value, 0) * 100)}%`;
}

export function formatCssPercent(value: number | undefined | null): string {
  return `${safeNumber(value, 0) * 100}%`;
}
