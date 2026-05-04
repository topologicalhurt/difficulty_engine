import type { BookRecord } from './books';
import type { EnrichmentCacheEntry } from './enrichment';
import type { ConstraintSet, GanttView, PlanColorMode } from './planner-settings';
import type { SourceSettings } from './source-settings';

export interface ManualScheduleOverride {
  ds?: number;
  days?: number;
}

export interface CalendarActualOverride {
  minutes?: number;
  pages?: number;
  done?: boolean;
}

export interface ManualOverrides {
  schedule: Record<string, ManualScheduleOverride>;
  deferred: Record<string, string[]>;
  actuals: Record<string, Record<string, CalendarActualOverride>>;
}

export interface PlannerProjectV1 {
  version: 1;
  library: {
    books: Record<string, BookRecord>;
  };
  manualOverrides: ManualOverrides;
  constraints: ConstraintSet;
  sourceSettings: SourceSettings;
  enrichmentCache: Record<string, EnrichmentCacheEntry>;
  uiPreferences: {
    ganttView: GanttView;
    ganttZoom: number;
    planColorMode: PlanColorMode;
  };
}
