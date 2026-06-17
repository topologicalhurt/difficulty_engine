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
    maxFeasibleBooksOnBlockedDays: 0,
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
  if (
    startableTotal > dayEntries.length &&
    feasibleBooks <= dayEntries.length
  ) {
    startability.parallelFitBlockedDays += 1;
    // Track the most books the budget could actually start on a blocked day.
    // This is the planner-true "fit at most M" the schedule warning reports,
    // computed with the real read/skim split and remaining pages — never a
    // separate flat-chunk estimate.
    startability.maxFeasibleBooksOnBlockedDays = Math.max(
      startability.maxFeasibleBooksOnBlockedDays,
      feasibleBooks,
    );
  }
}
