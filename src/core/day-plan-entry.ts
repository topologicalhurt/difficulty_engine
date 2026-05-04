import { calendarActualOverride } from './day-plan-overrides';
import type { PlanningState } from './internal-types';
import type { CalendarEntry, PlannerProjectV1 } from './types';

export type CalendarEntryStartMode = 'strict' | 'backfill' | 'prereq';

export function createCalendarEntry(
  project: PlannerProjectV1,
  state: PlanningState,
  dateStr: string,
  startMode: CalendarEntryStartMode,
): CalendarEntry {
  const override = calendarActualOverride(project, state, dateStr);
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
    strictMinPg: state.strictMinPg,
    effectiveMinPg: state.effectiveMinPg,
    backfilled: startMode === 'backfill',
    prereqOverlap: startMode === 'prereq',
    actualOverride: Boolean(override),
    actualMinutes: override?.minutes,
    actualPages: override?.pages,
    done: Boolean(override?.done),
  };
}
