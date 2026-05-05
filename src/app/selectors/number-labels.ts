function finiteNumber(value: number | undefined | null): number {
  return Number.isFinite(value) ? Number(value) : 0;
}

export function formatWholeNumber(value: number | undefined | null): string {
  return String(Math.round(finiteNumber(value)));
}

export function formatWholePercent(value: number | undefined | null): string {
  return `${formatWholeNumber(value)}%`;
}
