import { marginalMinutesForTenths } from './day-plan-work';
import type { PlanningState } from './internal-types';
import type {
  CalendarActualOverride,
  CalendarEntry,
  PlannerProjectV1,
} from './types';
import { safeNumber } from './utils';

export function calendarActualOverride(
  project: PlannerProjectV1,
  state: PlanningState,
  dateStr: string,
): CalendarActualOverride | null {
  return project.manualOverrides.actuals[dateStr]?.[state.id] ?? null;
}

export function tenthsForActualMinutes(
  state: PlanningState,
  actualMinutes: number,
): number {
  const minutes = Math.max(0, safeNumber(actualMinutes, 0));
  let best = 0;
  for (let tenths = 1; tenths <= state.remainingTenths; tenths += 1) {
    if (marginalMinutesForTenths(state, tenths) > minutes + 1e-6) break;
    best = tenths;
  }
  return best;
}

export function tenthsForActualPages(
  state: PlanningState,
  actualPages: number,
): number {
  const pages = Math.max(0, safeNumber(actualPages, 0));
  return Math.min(state.remainingTenths, Math.round(pages * 10));
}

export function hasActualProgressOverride(
  override: CalendarActualOverride | null,
): boolean {
  return override?.minutes != null || override?.pages != null;
}

export function tenthsForActualOverride(
  state: PlanningState,
  override: CalendarActualOverride | null,
  fallbackTenths: number,
): number {
  if (override?.pages != null)
    return tenthsForActualPages(state, override.pages);
  if (override?.minutes != null)
    return tenthsForActualMinutes(state, override.minutes);
  return fallbackTenths;
}

export function deferredCalendarEntry(state: PlanningState): CalendarEntry {
  return {
    bookId: state.id,
    short: state.short,
    displayGroup: state.displayGroup,
    lane: state.lane,
    track: state.coStudyGroup || `lane:${state.lane}`,
    mins: 0,
    readPages: 0,
    skimPages: 0,
    boosted: false,
    floorRelaxed: state.floorRelaxed,
    effectiveMinPg: state.effectiveMinPg,
    strictMinPg: state.strictMinPg,
    backfilled: false,
    prereqOverlap: false,
    actualOverride: false,
    done: false,
  };
}

export function recordDeferredCalendarEntry(
  missedByDate: Record<string, CalendarEntry[]>,
  state: PlanningState,
  dateStr: string,
): void {
  if (!missedByDate[dateStr]) missedByDate[dateStr] = [];
  if (missedByDate[dateStr].some((entry) => entry.bookId === state.id)) return;
  missedByDate[dateStr].push(deferredCalendarEntry(state));
}
