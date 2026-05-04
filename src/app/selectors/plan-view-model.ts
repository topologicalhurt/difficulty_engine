import type { AppState, CalendarEntry } from '../../core/types';
import { DAYS_PER_WEEK } from '../../core/date-constants';
import {
  addLocalDays,
  dateKeyFromDate,
  endOfStudyWeek,
  parseLocalDateKey,
  startOfStudyWeek,
} from '../../core/time';

const MAX_PARALLEL_POINTS = 21;
const MAX_DIFFICULTY_POINTS = 8;

export interface WeeklyLoadPoint {
  key: string;
  label: string;
  hours: number;
  targetHours: number;
  activeDays: number;
}

export interface ParallelPoint {
  key: string;
  label: string;
  activeBooks: number;
  minutes: number;
  targetBooks: number;
}

export interface DifficultyPoint {
  id: string;
  label: string;
  score: number;
  displayGroup: string;
  selected: boolean;
}

export interface CalendarDayCell {
  key: string;
  dayLabel: string;
  dayNumber: string;
  isCurrentMonth: boolean;
  status: 'planned' | 'outside_plan' | 'non_study_day' | 'waiting_for_release' | 'blocked' | 'no_feasible_chunk';
  statusLabel: string;
  statusDetail: string;
  entries: CalendarEntry[];
  missedEntries: CalendarEntry[];
}

export interface CalendarWeek {
  key: string;
  label: string;
  days: CalendarDayCell[];
}

function shortDate(date: Date): string {
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

function weekdayShort(date: Date): string {
  return date.toLocaleDateString('en-AU', { weekday: 'short' });
}

export function buildWeeklyLoadSeries(state: AppState): WeeklyLoadPoint[] {
  const byDate = state.snapshot.dayPlan.byDate;
  const dates = Object.keys(byDate).sort();
  const targetHours = state.project.constraints.hpd * state.project.constraints.dpw;
  const weeks = new Map<string, WeeklyLoadPoint>();

  dates.forEach((dateKey) => {
    const date = parseLocalDateKey(dateKey);
    const weekStart = startOfStudyWeek(date);
    const weekKey = dateKeyFromDate(weekStart);
    const current = weeks.get(weekKey) ?? {
      key: weekKey,
      label: shortDate(weekStart),
      hours: 0,
      targetHours,
      activeDays: 0,
    };
    const minutes = byDate[dateKey].reduce((sum, entry) => sum + entry.mins, 0);
    current.hours += minutes / 60;
    current.activeDays += 1;
    weeks.set(weekKey, current);
  });

  return Array.from(weeks.values()).sort((left, right) => left.key.localeCompare(right.key));
}

export function buildParallelSeries(state: AppState): ParallelPoint[] {
  const byDate = state.snapshot.dayPlan.byDate;
  const targetBooks = state.project.constraints.par;
  const dates = Object.keys(byDate).sort().slice(0, MAX_PARALLEL_POINTS);
  return dates.map((dateKey) => ({
    key: dateKey,
    label: parseLocalDateKey(dateKey).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
    }),
    activeBooks: byDate[dateKey].length,
    minutes: byDate[dateKey].reduce((sum, entry) => sum + entry.mins, 0),
    targetBooks,
  }));
}

export function buildDifficultySeries(state: AppState): DifficultyPoint[] {
  return Object.entries(state.snapshot.difficultyModel)
    .map(([id, difficulty]) => {
      const book = state.project.library.books[id];
      return {
        id,
        label: book?.short || book?.title || id,
        score: difficulty.scheduleDifficulty,
        displayGroup: book?.displayGroup || 'Ungrouped',
        selected: state.ui.selectedBookId === id,
      };
    })
    .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label))
    .slice(0, MAX_DIFFICULTY_POINTS);
}

export function buildCalendarWeeks(state: AppState): CalendarWeek[] {
  const byDate = state.snapshot.dayPlan.byDate;
  const missedByDate = state.snapshot.dayPlan.missedByDate;
  const allDates = Array.from(new Set([...Object.keys(byDate), ...Object.keys(missedByDate)])).sort();

  if (!allDates.length) return [];

  const firstDay = startOfStudyWeek(parseLocalDateKey(allDates[0]));
  const lastDay = endOfStudyWeek(parseLocalDateKey(allDates[allDates.length - 1]));
  const firstPlanDate = allDates[0];
  const lastPlanDate = allDates[allDates.length - 1];
  const studyWeekdays = new Set(state.project.constraints.studyWeekdays);
  const emptyReasonByDate = new Map(
    state.snapshot.dayPlan.startability.emptyStudyDays.map((entry) => [entry.dateStr, entry]),
  );
  const weeks: CalendarWeek[] = [];

  for (let cursor = new Date(firstDay); cursor <= lastDay; cursor = addLocalDays(cursor, DAYS_PER_WEEK)) {
    const weekStart = new Date(cursor);
    const label = `${shortDate(weekStart)} - ${shortDate(addLocalDays(weekStart, DAYS_PER_WEEK - 1))}`;
    const days: CalendarDayCell[] = [];

    for (let dayOffset = 0; dayOffset < DAYS_PER_WEEK; dayOffset += 1) {
      const day = addLocalDays(weekStart, dayOffset);
      const key = dateKeyFromDate(day);
      const entries = byDate[key] ?? [];
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
            : emptyReason?.reason ?? 'waiting_for_release';
      const statusLabel =
        status === 'planned'
          ? 'Planned'
          : status === 'outside_plan'
            ? key < firstPlanDate ? 'Before plan' : 'After finish'
            : status === 'non_study_day'
              ? 'Non-study day'
              : status === 'no_feasible_chunk'
                ? 'No feasible chunk'
                : status === 'blocked'
                  ? 'Blocked'
                  : 'Waiting';
      days.push({
        key,
        dayLabel: weekdayShort(day),
        dayNumber: day.toLocaleDateString('en-AU', { day: 'numeric' }),
        isCurrentMonth: day.getMonth() === weekStart.getMonth(),
        status,
        statusLabel,
        statusDetail: emptyReason?.detail ?? statusLabel,
        entries,
        missedEntries,
      });
    }

    weeks.push({
      key: dateKeyFromDate(weekStart),
      label,
      days,
    });
  }

  return weeks;
}
