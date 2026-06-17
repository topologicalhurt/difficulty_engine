import type {
  AiConnectionSettings,
  AiClarificationMessage,
  AiRelationshipProposal,
  AiRelationshipWizardState,
  AiRecommendationProposal,
  AiRecommendationStatus,
  AutopilotWizardState,
  AutopilotProposal,
  BookSearchStatus,
  BookSearchSuggestion,
  BookDocumentCandidateOption,
  ConstraintSet,
  EnrichmentCacheEntry,
  GanttView,
  CalendarLearningMode,
  PlanColorMode,
  PlannerProjectV1,
  QbittorrentConnectionSettings,
  QbittorrentRuntimeStatus,
} from './domain';
import type { EngineSnapshot } from './snapshot';

export type AppView =
  | 'library'
  | 'constraints'
  | 'plan'
  | 'calendar'
  | 'ai'
  | 'graphs'
  | 'diagnostics'
  | 'info'
  | 'project';
export type StoreEventType =
  | 'project-changed'
  | 'snapshot-updated'
  | 'enrichment-status-changed'
  | 'blocking-warning-raised';

export interface CalendarEntrySelection {
  dateKey: string;
  bookId: string;
}

export interface DocumentReaderState {
  bookId: string | null;
  documentId: string | null;
  status: 'idle' | 'loading' | 'ready' | 'failed';
  title: string;
  text: string;
  error: string | null;
}

export interface DocumentCandidateBrowserState {
  bookId: string | null;
  status: 'idle' | 'loading' | 'ready' | 'failed' | 'acquiring';
  candidates: BookDocumentCandidateOption[];
  error: string | null;
  manualSource: string;
}

export interface UiState {
  activeView: AppView;
  selectedBookId: string | null;
  selectedCalendarEntry: CalendarEntrySelection | null;
  calendarWeekIndex: number;
  ganttView: GanttView;
  ganttZoom: number;
  calendarLearningMode: CalendarLearningMode;
  planColorMode: PlanColorMode;
  openConstraintGroups: string[];
  selectedConstraintKey: keyof ConstraintSet | null;
  graphOptionsOpen: boolean;
  planSections: PlannerProjectV1['uiPreferences']['planSections'];
  libraryListWidthPx: number;
  bookSearchQuery: string;
  bookSearchStatus: BookSearchStatus;
  bookSearchResults: BookSearchSuggestion[];
  bookSearchHasMore: boolean;
  bookSearchOffset: number;
  bookSearchError: string | null;
  importExportText: string;
  importExportDirty: boolean;
  qbittorrentConnection: QbittorrentConnectionSettings;
  qbittorrentStatus: QbittorrentRuntimeStatus;
  documentReader: DocumentReaderState;
  documentCandidates: DocumentCandidateBrowserState;
  aiPrompt: string;
  aiConnection: AiConnectionSettings;
  aiSettingsRevision: number;
  aiStatus: AiRecommendationStatus;
  aiProposal: AiRecommendationProposal | null;
  aiClarificationStatus: AiRecommendationStatus;
  aiClarificationMessages: AiClarificationMessage[];
  aiClarificationAnswers: Record<string, string>;
  aiRelationshipStatus: AiRecommendationStatus;
  aiRelationshipWizard: AiRelationshipWizardState;
  aiRelationshipProposal: AiRelationshipProposal | null;
  autopilotDraft: AutopilotWizardState;
  autopilotProposal: AutopilotProposal | null;
  debugUi: boolean;
  banner: {
    tone: 'info' | 'success' | 'warn' | 'error';
    message: string;
  } | null;
  dialog: UiDialogState | null;
}

export interface UiDialogAction {
  id: string;
  label: string;
  tone?: 'primary' | 'secondary' | 'danger';
}

export interface UiDialogState {
  id: string;
  title: string;
  body: string;
  detail?: string;
  tone?: 'info' | 'success' | 'warn' | 'error';
  actions: UiDialogAction[];
}

export interface AppState {
  project: PlannerProjectV1;
  ui: UiState;
  snapshot: EngineSnapshot;
  enrichment: {
    byBookId: Record<string, EnrichmentCacheEntry>;
  };
  performance: {
    projectRevision: number;
    uiRevision: number;
    snapshotRevision: number;
    lastSnapshotMs: number;
    lastRenderMs: number;
    lastWorkerMs: number;
  };
}

export interface ConstraintFieldOption {
  value: string;
  label: string;
}

export type ConstraintEffect =
  | 'display_only'
  | 'workload_time'
  | 'schedule_policy'
  | 'difficulty_model'
  | 'relation_model'
  | 'enrichment'
  | 'ui_only';

export interface ConstraintField {
  key: keyof ConstraintSet;
  group: string;
  label: string;
  description: string;
  effect: ConstraintEffect;
  advanced?: boolean;
  summary?: string;
  detail?: string;
  optionDetails?: Record<string, string>;
  kind:
    | 'number'
    | 'select'
    | 'boolean'
    | 'date'
    | 'target-date'
    | 'weekday-set';
  min?: number;
  max?: number;
  step?: number;
  options?: ConstraintFieldOption[];
}

export interface PlannerStoreEvent {
  type: StoreEventType;
  project: PlannerProjectV1;
  snapshot: EngineSnapshot;
  payload?: Record<string, string | number | boolean | null>;
}
