import type { CalendarEntry, CalendarLearningMode } from '../../core/types';
import {
  addLocalDays,
  dateKeyFromDate,
  parseLocalDateKey,
} from '../../core/time';

export const HOUR_START = 0;
export const HOUR_END = 23;
export const HOUR_MINUTES = 60;
const DAY_MINUTES = 24 * HOUR_MINUTES;
const PLACEMENT_GRANULARITY_MINUTES = 15;

export interface OccupiedInterval {
  startMinute: number;
  endMinute: number;
}

export function clampStartMinute(value: number): number {
  return Math.max(
    0,
    Math.min(
      DAY_MINUTES - PLACEMENT_GRANULARITY_MINUTES,
      Math.round(value / PLACEMENT_GRANULARITY_MINUTES) *
        PLACEMENT_GRANULARITY_MINUTES,
    ),
  );
}

export function durationForEntry(entry: CalendarEntry): number {
  const estimatedMinutes = Math.max(30, Math.round(entry.mins || 30));
  return Math.min(
    12 * HOUR_MINUTES,
    Math.ceil(estimatedMinutes / PLACEMENT_GRANULARITY_MINUTES) *
      PLACEMENT_GRANULARITY_MINUTES,
  );
}

interface FocusWindow {
  startMinute: number;
  endMinute: number;
}

function focusWindow(mode: CalendarLearningMode): FocusWindow {
  if (mode === 'morning_focus') {
    return { startMinute: 7 * HOUR_MINUTES, endMinute: 15 * HOUR_MINUTES };
  }
  if (mode === 'afternoon_focus') {
    return { startMinute: 12 * HOUR_MINUTES, endMinute: 20 * HOUR_MINUTES };
  }
  if (mode === 'evening_focus') {
    return { startMinute: 17 * HOUR_MINUTES, endMinute: DAY_MINUTES };
  }
  if (mode === 'night_focus') {
    return { startMinute: 20 * HOUR_MINUTES, endMinute: DAY_MINUTES };
  }
  return { startMinute: 8 * HOUR_MINUTES, endMinute: 22 * HOUR_MINUTES };
}

function denseCandidates(
  window: FocusWindow,
  durationMinutes: number,
  occupied: OccupiedInterval[],
): number[] {
  const candidates: number[] = [];
  for (
    let start = window.startMinute;
    start + durationMinutes <= window.endMinute;
    start += PLACEMENT_GRANULARITY_MINUTES
  ) {
    candidates.push(start);
  }
  occupied.forEach((entry) => {
    const start = clampStartMinute(entry.endMinute);
    if (
      start >= window.startMinute &&
      start + durationMinutes <= window.endMinute
    ) {
      candidates.push(start);
    }
  });
  return [...new Set(candidates)].sort((left, right) => left - right);
}

function fallbackCandidates(
  window: FocusWindow,
  durationMinutes: number,
): number[] {
  const candidates: number[] = [];
  for (
    let start = window.endMinute;
    start + durationMinutes <= DAY_MINUTES;
    start += PLACEMENT_GRANULARITY_MINUTES
  ) {
    candidates.push(start);
  }
  for (
    let start = Math.min(
      window.startMinute - PLACEMENT_GRANULARITY_MINUTES,
      DAY_MINUTES - durationMinutes,
    );
    start >= 0;
    start -= PLACEMENT_GRANULARITY_MINUTES
  ) {
    candidates.push(start);
  }
  return candidates;
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
  const window = focusWindow(mode);
  const candidates = [
    ...denseCandidates(window, durationMinutes, occupied),
    ...fallbackCandidates(window, durationMinutes),
  ];
  const seen = new Set<number>();
  for (const start of candidates) {
    if (seen.has(start) || start + durationMinutes > DAY_MINUTES) {
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
