import { feasibleCandidateCount } from './day-plan-fit';
import type { DayPlanSnapshot, PlanningState } from './internal-types';
import type { CalendarEntry } from './types';

export function createStartabilitySummary(): DayPlanSnapshot['startability'] {
  return {
    underfilledDays: [],
    maxStartableBooksOnUnderfilledDays: 0,
    emptyStudyDays: [],
    unfilledParallelSlots: 0,
    parallelFitBlockedDays: 0,
    maxFeasibleBooksPerDay: 0,
  };
}

export function recordUnderfilledParallelSlots(
  startability: DayPlanSnapshot['startability'],
  dateStr: string,
  dayEntries: CalendarEntry[],
  maxParallel: number,
  candidates: PlanningState[],
  budgetMinutes: number,
): void {
  if (dayEntries.length >= maxParallel) return;
  const startableTotal = new Set(candidates.map((state) => state.id)).size;
  const feasibleBooks = feasibleCandidateCount(candidates, budgetMinutes);
  startability.underfilledDays.push({
    dateStr,
    startableBooks: startableTotal,
    plannedBooks: dayEntries.length,
    feasibleBooks,
  });
  startability.maxStartableBooksOnUnderfilledDays = Math.max(
    startability.maxStartableBooksOnUnderfilledDays,
    startableTotal,
  );
  startability.maxFeasibleBooksPerDay = Math.max(
    startability.maxFeasibleBooksPerDay,
    feasibleBooks,
  );
  startability.unfilledParallelSlots += maxParallel - dayEntries.length;
  if (startableTotal > dayEntries.length && feasibleBooks <= dayEntries.length) {
    startability.parallelFitBlockedDays += 1;
  }
}
