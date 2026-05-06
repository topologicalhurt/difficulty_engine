import type { DayPlanSnapshot, PlanningState } from './internal-types';
import type { CalendarEntry } from './types';

export function commitDayEntries(
  byDate: DayPlanSnapshot['byDate'],
  byBook: DayPlanSnapshot['byBook'],
  stateById: Record<string, PlanningState>,
  dateStr: string,
  slot: number,
  entries: CalendarEntry[],
): void {
  entries.sort(
    (left, right) =>
      left.lane - right.lane ||
      right.mins - left.mins ||
      left.short.localeCompare(right.short),
  );
  byDate[dateStr] = entries;
  entries.forEach((entry) => {
    const state = stateById[entry.bookId];
    if (!byBook[entry.bookId]) byBook[entry.bookId] = [];
    byBook[entry.bookId].push({ dateStr, ...entry });
    state.usedMinutes += entry.mins;
    state.usedTenths += Math.round((entry.readPages + entry.skimPages) * 10);
    state.peakTenths = Math.max(
      state.peakTenths,
      Math.round((entry.readPages + entry.skimPages) * 10),
    );
    if (state.actualStart == null) state.actualStart = slot;
    state.actualEnd = slot + 1;
    if (entry.boosted) state.boostedDays += 1;
  });
}
