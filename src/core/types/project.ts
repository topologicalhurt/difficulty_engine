import type { BookRecord } from './books';
import type { AiRecommendationSettings } from './ai';
import type { EnrichmentCacheEntry } from './enrichment';
import type {
  ConstraintSet,
  GanttView,
  PlanColorMode,
} from './planner-settings';
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

export interface ManualOverrides {
  schedule: Record<string, ManualScheduleOverride>;
  deferred: Record<string, string[]>;
  actuals: Record<string, Record<string, CalendarActualOverride>>;
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
  enrichmentCache: Record<string, EnrichmentCacheEntry>;
  uiPreferences: UiPreferences;
}
