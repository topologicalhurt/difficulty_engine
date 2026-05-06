import { compareChain, compareNumberAsc, compareText } from './sort';
import type { SchedulePlanItem } from './types';

export function groupBooks(
  items: SchedulePlanItem[],
): Record<string, SchedulePlanItem[]> {
  const grouped: Record<string, SchedulePlanItem[]> = {};
  items.forEach((item) => {
    const key = String(item.displayGroup || 'Ungrouped');
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  });
  Object.values(grouped).forEach((group) => {
    group.sort((left, right) =>
      compareChain(
        compareNumberAsc(left.ds, right.ds),
        compareNumberAsc(left.scheduleDifficulty, right.scheduleDifficulty),
        compareText(left.short, right.short),
      ),
    );
  });
  return grouped;
}
