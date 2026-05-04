import { DAYS_PER_WEEK } from './date-constants';
import { WEEKS_PER_MONTH_APPROX } from './constants';

const MIN_HORIZON_MONTHS = 1;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parsePlanningDateKey(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatPlanningDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function targetEndDateKey(startDateKey: string, horizonMonths: number): string {
  const start = parsePlanningDateKey(startDateKey) ?? new Date();
  const months = Math.max(MIN_HORIZON_MONTHS, horizonMonths || MIN_HORIZON_MONTHS);
  const days = Math.max(1, Math.round(months * WEEKS_PER_MONTH_APPROX * DAYS_PER_WEEK));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + days);
  return formatPlanningDateKey(end);
}

export function horizonMonthsFromEndDate(startDateKey: string, endDateKey: string): number {
  const start = parsePlanningDateKey(startDateKey);
  const end = parsePlanningDateKey(endDateKey);
  if (!start || !end) return MIN_HORIZON_MONTHS;
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / MS_PER_DAY));
  return Math.max(MIN_HORIZON_MONTHS, days / (DAYS_PER_WEEK * WEEKS_PER_MONTH_APPROX));
}
