const PLAN_DATE_LOCALE = 'en-AU';

export function formatPlanFullDate(date?: Date): string {
  return date
    ? date.toLocaleDateString(PLAN_DATE_LOCALE, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—';
}

export function formatPlanShortDate(date: Date): string {
  return date.toLocaleDateString(PLAN_DATE_LOCALE, {
    day: 'numeric',
    month: 'short',
  });
}

export function formatPlanWeekday(date: Date): string {
  return date.toLocaleDateString(PLAN_DATE_LOCALE, { weekday: 'short' });
}

export function formatPlanDayNumber(date: Date): string {
  return date.toLocaleDateString(PLAN_DATE_LOCALE, { day: 'numeric' });
}
