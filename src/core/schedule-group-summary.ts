import type { SchedulePlanItem } from './types';

export function groupBooks(items: SchedulePlanItem[]): Record<string, SchedulePlanItem[]> {
  const grouped: Record<string, SchedulePlanItem[]> = {};
  items.forEach((item) => {
    const key = String(item.displayGroup || 'Ungrouped');
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  });
  Object.values(grouped).forEach((group) => {
    group.sort(
      (left, right) =>
        left.ds - right.ds ||
        left.scheduleDifficulty - right.scheduleDifficulty ||
        left.short.localeCompare(right.short),
    );
  });
  return grouped;
}
