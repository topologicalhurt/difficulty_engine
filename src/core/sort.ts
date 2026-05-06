export function compareText(
  left: string | number | null | undefined,
  right: string | number | null | undefined,
): number {
  return String(left ?? '').localeCompare(String(right ?? ''));
}

export function compareNumberAsc(
  left: number | null | undefined,
  right: number | null | undefined,
): number {
  return (left ?? 0) - (right ?? 0);
}

export function compareNumberDesc(
  left: number | null | undefined,
  right: number | null | undefined,
): number {
  return compareNumberAsc(right, left);
}

export function compareChain(...comparisons: number[]): number {
  return comparisons.find((comparison) => comparison !== 0) ?? 0;
}
