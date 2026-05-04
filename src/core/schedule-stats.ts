import type { DayPlanSnapshot } from './internal-types';
import type { Clock, PlannerProjectV1, SchedulePlan, ScheduleStats } from './types';
import { maxOr, sum } from './utils';

export function computeScheduleStats(
  schedulePlan: SchedulePlan,
  dayPlan: DayPlanSnapshot,
  project: PlannerProjectV1,
  clock: Clock,
): ScheduleStats {
  const entries = Object.values(dayPlan.byBookStats);
  const allocatedMinutes = sum(entries.map((entry) => entry.minutes || 0));
  const residualMinutes = sum(entries.map((entry) => entry.remainingMinutes || 0));
  const spanSlots = maxOr(entries.map((entry) => entry.actualEnd || 0), 0);
  const targetSpanSlots = maxOr(
    schedulePlan.items.map((item) => Math.round(item.de || 0)),
    0,
  );
  const spanWeeks = spanSlots / Math.max(1, project.constraints.dpw);
  const targetSpanWeeks = targetSpanSlots / Math.max(1, project.constraints.dpw);
  const hardInfeasibleBooks = entries.filter(
    (entry) => entry.hardInfeasible || entry.infeasibleReason,
  ).length;
  const blockedBooks = entries.filter(
    (entry) =>
      !entry.hardInfeasible &&
      Boolean(entry.blockedReason) &&
      (entry.unfinishedPages || 0) > 0.01,
  ).length;
  const unfinishedBooks = entries.filter(
    (entry) => (entry.unfinishedPages || 0) > 0.01,
  ).length;
  const floorRelaxedBooks = entries.filter((entry) => entry.floorRelaxed).length;
  const backfilledStarts = entries.filter((entry) => entry.backfilled).length;
  const prereqOverlapStarts = entries.filter((entry) => entry.prereqOverlapUsed).length;
  let peakMinutes = 0;
  let peakBooks = 0;
  let overbookedDays = 0;
  let floorViolations = 0;
  let capViolations = 0;
  const relaxedDates = new Set<string>();
  Object.entries(dayPlan.byDate).forEach(([dateStr, dayEntries]) => {
    const mins = sum(dayEntries.map((entry) => entry.mins || 0));
    peakMinutes = Math.max(peakMinutes, mins);
    peakBooks = Math.max(peakBooks, dayEntries.length);
    if (mins > project.constraints.hpd * 60 + 0.01) {
      overbookedDays += 1;
    }
    dayEntries.forEach((entry) => {
      if (entry.floorRelaxed) relaxedDates.add(dateStr);
      const pages = entry.readPages + entry.skimPages;
      if (pages > project.constraints.maxPg + 0.05) {
        capViolations += 1;
      }
      if (pages > 0.05 && pages < entry.effectiveMinPg - 0.05) {
        floorViolations += 1;
      }
    });
  });
  const finishDate =
    unfinishedBooks || hardInfeasibleBooks || blockedBooks || !spanSlots
      ? undefined
      : clock.slotToDate(Math.max(0, spanSlots - 1), dayPlan.start, project);

  return {
    finishDate,
    totalHours: (allocatedMinutes + residualMinutes) / 60,
    remainingHours: residualMinutes / 60,
    spanSlots,
    spanWeeks,
    targetSpanSlots,
    targetSpanWeeks,
    spillWeeks: Math.max(0, spanWeeks - targetSpanWeeks),
    hardInfeasibleBooks,
    blockedBooks,
    unfinishedBooks,
    floorRelaxedBooks,
    floorRelaxedDays: relaxedDates.size,
    underfilledParallelDays: dayPlan.startability.underfilledDays.length,
    maxStartableBooksOnUnderfilledDays:
      dayPlan.startability.maxStartableBooksOnUnderfilledDays,
    emptyStudyDays: dayPlan.startability.emptyStudyDays.length,
    outsidePlanCalendarCells: 0,
    unfilledParallelSlots: dayPlan.startability.unfilledParallelSlots,
    parallelFitBlockedDays: dayPlan.startability.parallelFitBlockedDays,
    maxFeasibleBooksPerDay: dayPlan.startability.maxFeasibleBooksPerDay,
    backfilledStarts,
    prereqOverlapStarts,
    peakBooks,
    peakMinutes,
    overbookedDays,
    floorViolations,
    capViolations,
  };
}
