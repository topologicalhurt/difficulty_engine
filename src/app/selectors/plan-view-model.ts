import type { AppState } from '../../core/types';
import {
  dateKeyFromDate,
  parseLocalDateKey,
  startOfStudyWeek,
} from '../../core/time';
import { formatPlanShortDate } from './date-labels';

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

export function buildWeeklyLoadSeries(state: AppState): WeeklyLoadPoint[] {
  const byDate = state.snapshot.dayPlan.byDate;
  const dates = Object.keys(byDate).sort();
  const targetHours =
    state.project.constraints.hpd * state.project.constraints.dpw;
  const weeks = new Map<string, WeeklyLoadPoint>();

  dates.forEach((dateKey) => {
    const date = parseLocalDateKey(dateKey);
    const weekStart = startOfStudyWeek(date);
    const weekKey = dateKeyFromDate(weekStart);
    const current = weeks.get(weekKey) ?? {
      key: weekKey,
      label: formatPlanShortDate(weekStart),
      hours: 0,
      targetHours,
      activeDays: 0,
    };
    const minutes = byDate[dateKey].reduce((sum, entry) => sum + entry.mins, 0);
    current.hours += minutes / 60;
    current.activeDays += 1;
    weeks.set(weekKey, current);
  });

  return Array.from(weeks.values()).sort((left, right) =>
    left.key.localeCompare(right.key),
  );
}

export function buildParallelSeries(state: AppState): ParallelPoint[] {
  const byDate = state.snapshot.dayPlan.byDate;
  const targetBooks = state.project.constraints.par;
  const dates = Object.keys(byDate).sort().slice(0, MAX_PARALLEL_POINTS);
  return dates.map((dateKey) => ({
    key: dateKey,
    label: formatPlanShortDate(parseLocalDateKey(dateKey)),
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
    .sort(
      (left, right) =>
        right.score - left.score || left.label.localeCompare(right.label),
    )
    .slice(0, MAX_DIFFICULTY_POINTS);
}
