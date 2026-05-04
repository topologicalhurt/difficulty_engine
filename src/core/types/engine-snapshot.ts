import type { AuditReport } from './warnings';
import type { DifficultyBreakdown, WorkloadClusterSummary } from './difficulty-snapshot';
import type { RelationEvidence } from './relation-snapshot';
import type { RenderModel } from './render-snapshot';
import type {
  CalendarEntry,
  DayBookStat,
  SchedulePlan,
  SchedulePlanItem,
  ScheduleStats,
  SortedBookSummary,
} from './schedule-snapshot';
import type { OverlapClusterSummary, TopicNode } from './topic-snapshot';

export interface EngineSnapshot {
  topics: TopicNode[];
  topicsById: Record<string, TopicNode>;
  overlapClusters: OverlapClusterSummary[];
  workloadClusters: WorkloadClusterSummary[];
  relations: RelationEvidence[];
  relationConfidence: number;
  difficultyModel: Record<string, DifficultyBreakdown>;
  schedulePlan: SchedulePlan;
  dayPlan: {
    byDate: Record<string, CalendarEntry[]>;
    byBook: Record<string, Array<CalendarEntry & { dateStr: string }>>;
    byBookStats: Record<string, DayBookStat>;
    missedByDate: Record<string, CalendarEntry[]>;
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
  };
  renderModel: RenderModel;
  diagnostics: AuditReport;
  scheduleStats: ScheduleStats;
  sortedBooks: SortedBookSummary[];
  groupSummary: Record<string, SchedulePlanItem[]>;
  graphPrereqsById: Record<string, string[]>;
  coStudyMeta: SchedulePlan['coStudyMeta'];
  schedById: Record<
    string,
    SchedulePlanItem & {
      actualStart: number | null;
      actualEnd: number | null;
      hrs: number;
      actualHours: number;
      residualHours: number;
      unfinishedPages: number;
      boostedDays: number;
      dayPages: number;
      wks: number;
    }
  >;
}
