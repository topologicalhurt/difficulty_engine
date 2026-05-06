function finiteNumber(value: number | undefined | null): number {
  return Number.isFinite(value) ? Number(value) : 0;
}

export function formatOneDecimal(value: number | undefined | null): string {
  const safe = finiteNumber(value);
  return (Math.round((safe + Number.EPSILON) * 10) / 10).toFixed(1);
}

export function formatWholeNumber(value: number | undefined | null): string {
  return String(Math.round(finiteNumber(value)));
}

export function formatWholePercent(value: number | undefined | null): string {
  return `${formatWholeNumber(value)}%`;
}

export function formatRatioPercent(value: number | undefined | null): string {
  return `${formatWholeNumber(finiteNumber(value) * 100)}%`;
}

export function formatCssPercent(value: number | undefined | null): string {
  return `${finiteNumber(value) * 100}%`;
}
