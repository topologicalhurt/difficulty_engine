import type {
  BookRecord,
  ManualScheduleOverride,
  ScheduleAlgorithm,
} from './domain';

export interface ScheduleRow {
  id: string;
  short: string;
  displayGroup: string;
  lane: number;
  releaseSlot: number;
  targetStart: number;
  targetEnd: number;
  actualStart: number | null;
  actualEnd: number | null;
  strictMinPg: number;
  effectiveMinPg: number;
  floorRelaxed: boolean;
  backfilled: boolean;
  prereqOverlapUsed: boolean;
  unresolvedPages: number;
  boostedDays: number;
}

export interface CalendarEntry {
  bookId: string;
  short: string;
  displayGroup: string;
  lane: number;
  track: string;
  mins: number;
  readPages: number;
  skimPages: number;
  boosted: boolean;
  floorRelaxed: boolean;
  effectiveMinPg: number;
  strictMinPg: number;
  backfilled: boolean;
  prereqOverlap: boolean;
  actualOverride: boolean;
  actualMinutes?: number;
  actualPages?: number;
  done: boolean;
}

export interface DayBookStat {
  id: string;
  targetStart: number;
  targetEnd: number;
  actualStart: number | null;
  actualEnd: number | null;
  actualWks: number;
  usedDays: number;
  minutes: number;
  remainingMinutes: number;
  dayPages: number;
  peakDayPages: number;
  boostedDays: number;
  unfinishedPages: number;
  infeasibleReason: string | null;
  hardInfeasible: boolean;
  blockedReason: string | null;
  plannedStudyDays: number;
  minFeasibleDays: number;
  maxFeasibleDays: number;
  overlapReasons: string[];
  strictMinPg: number;
  effectiveMinPg: number;
  floorRelaxed: boolean;
  relaxationReason: string | null;
  backfilled: boolean;
  prereqOverlapUsed: boolean;
  releaseFidelity: boolean;
  laneFidelity: boolean;
}

export interface ScheduleStats {
  finishDate?: Date;
  totalHours: number;
  remainingHours: number;
  spanSlots: number;
  spanWeeks: number;
  targetSpanSlots: number;
  targetSpanWeeks: number;
  spillWeeks: number;
  hardInfeasibleBooks: number;
  blockedBooks: number;
  unfinishedBooks: number;
  floorRelaxedBooks: number;
  floorRelaxedDays: number;
  underfilledParallelDays: number;
  maxStartableBooksOnUnderfilledDays: number;
  emptyStudyDays: number;
  outsidePlanCalendarCells: number;
  unfilledParallelSlots: number;
  parallelFitBlockedDays: number;
  maxFeasibleBooksPerDay: number;
  backfilledStarts: number;
  prereqOverlapStarts: number;
  peakBooks: number;
  peakMinutes: number;
  overbookedDays: number;
  floorViolations: number;
  capViolations: number;
}

export interface SchedulePlanItem {
  id: string;
  title: string;
  short: string;
  displayGroup: string;
  authors: string[];
  pages: number;
  scheduleDifficulty: number;
  displayDifficulty: number;
  baseDays: number;
  plannedDays: number;
  requestedDays: number;
  dayPages: number;
  dayMins: number;
  hours: number;
  strictMinPg: number;
  effectiveMinPg: number;
  floorRelaxed: boolean;
  absolutePageTarget: number;
  relativePageTarget: number;
  relativePacingPercentile: number;
  pacingPageTarget: number;
  floorPolicy: 'strict' | 'relaxed';
  manual: ManualScheduleOverride;
  manualOverride: boolean;
  manualHardWindow: boolean;
  manualStartLocked: boolean;
  manualDaysLocked: boolean;
  manualWindowImpossibleReason: string | null;
  depth: number;
  prereqs: string[];
  allowPrereqOverlap: boolean;
  completed: boolean;
  scheduleRank: number;
  windowMinDays: number;
  windowMaxDays: number;
  lane: number;
  laneEnforced: boolean;
  releaseSlot: number;
  targetWindow: { start: number; end: number };
  targetWindowStart: number;
  targetWindowEnd: number;
  coStudyGroup: string | null;
  ds: number;
  de: number;
  wks: number;
  mutualBatchIndex: number;
  coStudyGroupSize: number;
  lanePrevId: string | null;
}

export interface SchedulePlan {
  items: SchedulePlanItem[];
  byId: Record<string, SchedulePlanItem>;
  selectedAlgorithm: ScheduleAlgorithm;
  prereqById: Record<string, string[]>;
  graphPrereqsById: Record<string, string[]>;
  coStudyMeta: {
    groups: Array<{ id: string; ids: string[] }>;
    lookup: Record<string, string>;
  };
  exclusionState: {
    ignoredSet: Set<string>;
    rdSet: Set<string>;
    rdChains: Array<{
      ids: string[];
      avgDelta: number;
      avgConfidence: number;
      label: string;
    }>;
    manualRDIds: string[];
  };
  groupSummary: Record<string, SchedulePlanItem[]>;
  activeIds: string[];
  coStudyPairs: Array<[string, string]>;
}

export type SortedBookSummary = BookRecord & {
  abs: number;
  rel: number;
  eff: number;
  timeEff: number;
  dep: number;
};
