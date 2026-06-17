import type { CalendarEntry, CalendarLearningMode } from '../../core/types';
import {
  DAY_MINUTES,
  TIME_BLOCK_GRANULARITY_MINUTES as PLACEMENT_GRANULARITY_MINUTES,
  snapToTimeGrid,
} from '../../core/date-constants';
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
  return Math.max(
    0,
    Math.min(DAY_MINUTES - PLACEMENT_GRANULARITY_MINUTES, snapToTimeGrid(value)),
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
): number | null {
  if (durationMinutes > DAY_MINUTES) {
    return null;
  }
  const window = focusWindow(mode);
  const seen = new Set<number>();
  const firstFitting = (candidates: number[]): number | null => {
    for (const start of candidates) {
      if (seen.has(start) || start + durationMinutes > DAY_MINUTES) {
        continue;
      }
      seen.add(start);
      if (!overlaps(start, durationMinutes, occupied)) return start;
    }
    return null;
  };
  // Try the in-window dense slots first; only build the (larger) out-of-window
  // fallback set when no dense slot is free.
  const dense = firstFitting(denseCandidates(window, durationMinutes, occupied));
  if (dense != null) return dense;
  return firstFitting(fallbackCandidates(window, durationMinutes));
}

export function formatClockMinute(minute: number): string {
  // Wrap end-of-day so a block ending at exactly 24:00 reads 00:00 (matching
  // the ICS rollover) rather than the invalid "24:00".
  const wrapped = ((minute % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const hours = Math.floor(wrapped / 60);
  const minutes = wrapped % 60;
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
