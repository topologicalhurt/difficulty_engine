export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function weekdaysForCount(count: number): number[] {
  return WEEKDAY_ORDER.slice(
    0,
    Math.max(1, Math.min(7, Math.round(count || 1))),
  ).sort((left, right) => left - right);
}
