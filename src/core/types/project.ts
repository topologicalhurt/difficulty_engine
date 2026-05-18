import type { BookRecord } from './books';
import type { AiRecommendationSettings } from './ai';
import type { EnrichmentCacheEntry } from './enrichment';
import type {
  ConstraintSet,
  GanttView,
  PlanColorMode,
} from './planner-settings';
import type { ReadingScopeSettings } from './reading-scope';
import type { SourceSettings } from './source-settings';

export interface ManualScheduleOverride {
  ds?: number;
  days?: number;
}

export interface CalendarActualOverride {
  minutes?: number;
  pages?: number;
  done?: boolean;
  autoFilledFromPlan?: boolean;
}

export interface CalendarTimeBlockOverride {
  startMinute: number;
  durationMinutes: number;
}

export interface ManualOverrides {
  schedule: Record<string, ManualScheduleOverride>;
  deferred: Record<string, string[]>;
  actuals: Record<string, Record<string, CalendarActualOverride>>;
  timeBlocks?: Record<string, Record<string, CalendarTimeBlockOverride>>;
}

export interface UiPreferences {
  ganttView: GanttView;
  ganttZoom: number;
  planColorMode: PlanColorMode;
  planSections: {
    gantt: boolean;
    calendar: boolean;
  };
  libraryListWidthPx: number;
  dismissedWarningCodes: string[];
  backupsEnabled: boolean;
}

export interface PlannerProjectV1 {
  version: 1;
  library: {
    books: Record<string, BookRecord>;
  };
  manualOverrides: ManualOverrides;
  constraints: ConstraintSet;
  aiRecommendationSettings: AiRecommendationSettings;
  sourceSettings: SourceSettings;
  readingScopeSettings?: ReadingScopeSettings;
  enrichmentCache: Record<string, EnrichmentCacheEntry>;
  uiPreferences: UiPreferences;
}
