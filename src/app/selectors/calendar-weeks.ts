import type { AppState, CalendarEntry } from '../../core/types';
import { DAYS_PER_WEEK } from '../../core/date-constants';
import { formatWholeNumber } from '../../core/number-format';
import {
  addLocalDays,
  dateKeyFromDate,
  endOfStudyWeek,
  parseLocalDateKey,
  startOfStudyWeek,
} from '../../core/time';
import {
  formatPlanDayNumber,
  formatPlanShortDate,
  formatPlanWeekday,
} from './date-labels';

export interface CalendarDayCell {
  key: string;
  dayLabel: string;
  dayNumber: string;
  isCurrentMonth: boolean;
  status:
    | 'planned'
    | 'outside_plan'
    | 'non_study_day'
    | 'waiting_for_release'
    | 'blocked'
    | 'no_feasible_chunk';
  statusLabel: string;
  statusDetail: string;
  entries: CalendarEntry[];
  sortedEntries: CalendarEntry[];
  entrySummary: string;
  plannedMinutes: number;
  missedEntries: CalendarEntry[];
}

export interface CalendarWeek {
  key: string;
  label: string;
  days: CalendarDayCell[];
}

let calendarWeeksCache: {
  dayPlan: AppState['snapshot']['dayPlan'];
  studyWeekdaysKey: string;
  weeks: CalendarWeek[];
} | null = null;

export function buildCalendarWeeks(state: AppState): CalendarWeek[] {
  const studyWeekdaysKey = state.project.constraints.studyWeekdays.join(',');
  if (
    calendarWeeksCache?.dayPlan === state.snapshot.dayPlan &&
    calendarWeeksCache.studyWeekdaysKey === studyWeekdaysKey
  ) {
    return calendarWeeksCache.weeks;
  }
  const byDate = state.snapshot.dayPlan.byDate;
  const missedByDate = state.snapshot.dayPlan.missedByDate;
  const allDates = Array.from(
    new Set([...Object.keys(byDate), ...Object.keys(missedByDate)]),
  ).sort();

  if (!allDates.length) {
    calendarWeeksCache = {
      dayPlan: state.snapshot.dayPlan,
      studyWeekdaysKey,
      weeks: [],
    };
    return [];
  }

  const firstDay = startOfStudyWeek(parseLocalDateKey(allDates[0]));
  const lastDay = endOfStudyWeek(
    parseLocalDateKey(allDates[allDates.length - 1]),
  );
  const firstPlanDate = allDates[0];
  const lastPlanDate = allDates[allDates.length - 1];
  const studyWeekdays = new Set(state.project.constraints.studyWeekdays);
  const emptyReasonByDate = new Map(
    state.snapshot.dayPlan.startability.emptyStudyDays.map((entry) => [
      entry.dateStr,
      entry,
    ]),
  );
  const weeks: CalendarWeek[] = [];

  for (
    let cursor = firstDay;
    cursor <= lastDay;
    cursor = addLocalDays(cursor, DAYS_PER_WEEK)
  ) {
    const weekStart = cursor;
    const label = `${formatPlanShortDate(weekStart)} - ${formatPlanShortDate(addLocalDays(weekStart, DAYS_PER_WEEK - 1))}`;
    const days: CalendarDayCell[] = [];

    for (let dayOffset = 0; dayOffset < DAYS_PER_WEEK; dayOffset += 1) {
      const day = addLocalDays(weekStart, dayOffset);
      const key = dateKeyFromDate(day);
      const entries = byDate[key] ?? [];
      const sortedEntries = entries
        .slice()
        .sort(
          (left, right) =>
            left.lane - right.lane || left.short.localeCompare(right.short),
        );
      const plannedMinutes = entries.reduce(
        (sum, entry) => sum + entry.mins,
        0,
      );
      const missedEntries = missedByDate[key] ?? [];
      const emptyReason = emptyReasonByDate.get(key);
      const outsidePlan = key < firstPlanDate || key > lastPlanDate;
      const nonStudy = !studyWeekdays.has(day.getDay());
      const status = entries.length
        ? 'planned'
        : outsidePlan
          ? 'outside_plan'
          : nonStudy
            ? 'non_study_day'
            : (emptyReason?.reason ?? 'waiting_for_release');
      const statusLabel =
        status === 'planned'
          ? 'Planned'
          : status === 'outside_plan'
            ? key < firstPlanDate
              ? 'Before plan'
              : 'After finish'
            : status === 'non_study_day'
              ? 'Non-study day'
              : status === 'no_feasible_chunk'
                ? 'No feasible chunk'
                : status === 'blocked'
                  ? 'Blocked'
                  : 'Waiting';
      days.push({
        key,
        dayLabel: formatPlanWeekday(day),
        dayNumber: formatPlanDayNumber(day),
        isCurrentMonth: day.getMonth() === weekStart.getMonth(),
        status,
        statusLabel,
        statusDetail: emptyReason?.detail ?? statusLabel,
        entries,
        sortedEntries,
        entrySummary: entries.length
          ? `${entries.length} book${entries.length === 1 ? '' : 's'} · ${formatWholeNumber(plannedMinutes)}m`
          : statusLabel,
        plannedMinutes,
        missedEntries,
      });
    }

    weeks.push({
      key: dateKeyFromDate(weekStart),
      label,
      days,
    });
  }

  calendarWeeksCache = {
    dayPlan: state.snapshot.dayPlan,
    studyWeekdaysKey,
    weeks,
  };
  return weeks;
}
