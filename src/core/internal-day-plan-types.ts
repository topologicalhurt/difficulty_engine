import type { CalendarEntry, DayBookStat } from './types';

export interface PlanningState {
  id: string;
  short: string;
  title: string;
  displayGroup: string;
  lane: number;
  eff: number;
  displayEff: number;
  pages: number;
  manual: boolean;
  manualStartLocked: boolean;
  manualHardWindow: boolean;
  manualDaysLocked: boolean;
  manualWindowImpossibleReason: string | null;
  prereqs: string[];
  allowPrereqOverlap: boolean;
  scheduleRank: number;
  lanePrevId: string | null;
  laneEnforced: boolean;
  coStudyGroup: string | null;
  releaseSlot: number;
  targetDe: number;
  plannedDays: number;
  strictMinPg: number;
  effectiveMinPg: number;
  floorRelaxed: boolean;
  floorPolicy: 'strict' | 'relaxed';
  totalTenths: number;
  remainingTenths: number;
  readRemainTenths: number;
  skimRemainTenths: number;
  readTotalTenths: number;
  skimTotalTenths: number;
  mppRead: number;
  skimRatio: number;
  targetHrs: number;
  targetDayPages: number;
  overlapReasons: string[];
  usedMinutes: number;
  usedTenths: number;
  usedDays: number;
  peakTenths: number;
  actualStart: number | null;
  actualEnd: number | null;
  boostedDays: number;
  unfinishedTenths: number;
  infeasibleReason: string | null;
  blockedReason: string | null;
  planDays: number;
  minFeasibleDays: number;
  maxFeasibleDays: number;
  strictMinTenths: number;
  minTenths: number;
  maxTenths: number;
  maxTenthsFeasible: number;
  backfilled: boolean;
  prereqOverlapUsed: boolean;
  startPolicy: 'strict' | 'backfill' | 'prereq' | null;
  hardInfeasible: boolean;
  relaxationReason: string | null;
}

export interface DayPlanSnapshot {
  start: Date;
  byDate: Record<string, CalendarEntry[]>;
  byBook: Record<string, Array<CalendarEntry & { dateStr: string }>>;
  missedByDate: Record<string, CalendarEntry[]>;
  byBookStats: Record<string, DayBookStat>;
  overlapMap: Record<
    string,
    { skimFrac: number; timeSaved: number; reasons: string[] }
  >;
  startability: {
    underfilledDays: Array<{
      dateStr: string;
      startableBooks: number;
      plannedBooks: number;
      feasibleBooks: number;
    }>;
    maxStartableBooksOnUnderfilledDays: number;
    emptyStudyDays: Array<{
      dateStr: string;
      reason: 'waiting_for_release' | 'blocked' | 'no_feasible_chunk';
      detail: string;
    }>;
    unfilledParallelSlots: number;
    parallelFitBlockedDays: number;
    maxFeasibleBooksPerDay: number;
  };
}
