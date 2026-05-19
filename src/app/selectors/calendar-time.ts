import type { CalendarEntry, CalendarLearningMode } from '../../core/types';
import {
  addLocalDays,
  dateKeyFromDate,
  parseLocalDateKey,
} from '../../core/time';

export const HOUR_START = 0;
export const HOUR_END = 23;
export const HOUR_MINUTES = 60;

export interface OccupiedInterval {
  startMinute: number;
  endMinute: number;
}

export function clampStartMinute(value: number): number {
  return Math.max(0, Math.min(23 * HOUR_MINUTES, Math.round(value / 60) * 60));
}

export function durationForEntry(entry: CalendarEntry): number {
  return Math.max(30, Math.min(12 * 60, Math.round(entry.mins || 30)));
}

function preferredStarts(mode: CalendarLearningMode): number[] {
  if (mode === 'morning_focus') {
    return [8, 9, 10, 11, 13, 14, 15, 16, 7, 17, 18, 19, 20, 21, 22].map(
      (hour) => hour * HOUR_MINUTES,
    );
  }
  if (mode === 'evening_focus') {
    return [18, 19, 20, 21, 17, 16, 14, 15, 9, 10, 11, 8, 22, 7].map(
      (hour) => hour * HOUR_MINUTES,
    );
  }
  return [9, 10, 14, 15, 18, 19, 8, 11, 16, 20, 7, 13, 21, 22].map(
    (hour) => hour * HOUR_MINUTES,
  );
}

export function overlaps(
  startMinute: number,
  durationMinutes: number,
  occupied: OccupiedInterval[],
): boolean {
  const endMinute = startMinute + durationMinutes;
  return occupied.some(
    (entry) => startMinute < entry.endMinute && endMinute > entry.startMinute,
  );
}

export function nextAvailableStart(
  durationMinutes: number,
  occupied: OccupiedInterval[],
  mode: CalendarLearningMode,
): number {
  const candidates = [
    ...preferredStarts(mode),
    ...Array.from({ length: 24 }, (_, hour) => hour * HOUR_MINUTES),
  ];
  const seen = new Set<number>();
  for (const start of candidates) {
    if (seen.has(start) || start + durationMinutes > 24 * HOUR_MINUTES) {
      continue;
    }
    seen.add(start);
    if (!overlaps(start, durationMinutes, occupied)) return start;
  }
  return clampStartMinute(23 * HOUR_MINUTES);
}

export function formatClockMinute(minute: number): string {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function calendarDateTime(dateKey: string, minute: number): string {
  const dayOffset = Math.floor(minute / (24 * 60));
  const localMinute = minute % (24 * 60);
  const resolvedDate = dayOffset
    ? dateKeyFromDate(addLocalDays(parseLocalDateKey(dateKey), dayOffset))
    : dateKey;
  const compactDate = resolvedDate.replaceAll('-', '');
  const hours = String(Math.floor(localMinute / 60)).padStart(2, '0');
  const minutes = String(localMinute % 60).padStart(2, '0');
  return `${compactDate}T${hours}${minutes}00`;
}
