import { WEEKS_PER_MONTH_APPROX } from './constants';
import { DAYS_PER_WEEK, WEEK_START_DAY } from './date-constants';
import type { Clock, PlannerProjectV1 } from './types';
import { weekdaysForCount } from './weekdays';

export const EPOCH_ISO_TIMESTAMP = '1970-01-01T00:00:00.000Z';

export function localDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function studyWeekdays(project: PlannerProjectV1): number[] {
  const constraints = project.constraints;
  if (constraints.weekdaysCustom && constraints.studyWeekdays.length > 0) {
    return [...constraints.studyWeekdays].sort((left, right) => left - right);
  }
  return weekdaysForCount(constraints.dpw);
}

function isStudyDate(date: Date, weekdays: Set<number>): boolean {
  return weekdays.has(date.getUTCDay());
}

function addUtcDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

export function parseLocalDateKey(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00`);
}

export function dateKeyFromDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addLocalDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function startOfStudyWeek(date: Date): Date {
  const current = new Date(date);
  const weekday = current.getDay();
  const distance = (weekday - WEEK_START_DAY + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  current.setDate(current.getDate() - distance);
  return current;
}

export function endOfStudyWeek(date: Date): Date {
  return addLocalDays(startOfStudyWeek(date), DAYS_PER_WEEK - 1);
}

export function studyDateFromSlot(
  project: PlannerProjectV1,
  slot: number,
  start: Date = plannerClock.timelineStart(project),
): Date {
  const weekdays = new Set(studyWeekdays(project));
  let cursor = new Date(start);
  while (!isStudyDate(cursor, weekdays)) {
    cursor = addUtcDays(cursor, 1);
  }
  let remaining = Math.max(0, Math.round(slot || 0));
  while (remaining > 0) {
    cursor = addUtcDays(cursor, 1);
    if (isStudyDate(cursor, weekdays)) {
      remaining -= 1;
    }
  }
  return cursor;
}

export const plannerClock: Clock = {
  now(): Date {
    return new Date();
  },
  timelineStart(project: PlannerProjectV1): Date {
    const input = project.constraints.sd || localDateKey();
    return new Date(`${input}T12:00:00Z`);
  },
  slotToDate(slot: number, start: Date, project: PlannerProjectV1): Date {
    return studyDateFromSlot(project, slot, start);
  },
  dateKey(date: Date): string {
    return dateKeyFromDate(date);
  },
  totalTimelineSlots(project: PlannerProjectV1): number {
    return Math.round(
      project.constraints.tl *
        WEEKS_PER_MONTH_APPROX *
        studyWeekdays(project).length,
    );
  },
  realWeeks(project: PlannerProjectV1): number {
    return project.constraints.tl * WEEKS_PER_MONTH_APPROX;
  },
};
