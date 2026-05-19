import {
  DEFAULT_UI_STATE,
  createDefaultAiRelationshipWizardState,
  createDefaultAutopilotWizardState,
} from '../core/defaults';
import { serializeProject } from '../core/project-file';
import type {
  AppState,
  CreatePlannerStoreOptions,
  EnrichmentCacheEntry,
  PlannerProjectV1,
  UiState,
} from '../core/types';
import { readPerformanceNowMs } from './performance';

export type AppPerformanceState = AppState['performance'];

export const INITIAL_PERFORMANCE_STATE: AppPerformanceState = {
  projectRevision: 0,
  uiRevision: 0,
  snapshotRevision: 0,
  lastSnapshotMs: 0,
  lastRenderMs: 0,
  lastWorkerMs: 0,
};

export function withSnapshot(
  project: PlannerProjectV1,
  ui: UiState,
  engine: CreatePlannerStoreOptions['engine'],
  performance: AppPerformanceState = INITIAL_PERFORMANCE_STATE,
): AppState {
  const startedAt = readPerformanceNowMs();
  const snapshot = engine.computeSnapshot(project);
  const lastSnapshotMs = readPerformanceNowMs() - startedAt;
  return {
    project,
    ui,
    snapshot,
    enrichment: {
      byBookId: project.enrichmentCache,
    },
    performance: {
      ...performance,
      lastSnapshotMs,
    },
  };
}

export function nextBookId(project: PlannerProjectV1): string {
  const existing = new Set(Object.keys(project.library.books));
  let index = Object.keys(project.library.books).length + 1;
  while (existing.has(`book-${index}`)) {
    index += 1;
  }
  return `book-${index}`;
}

function ensureSelectedBook(
  project: PlannerProjectV1,
  selectedBookId: string | null,
): string | null {
  if (selectedBookId && project.library.books[selectedBookId]) {
    return selectedBookId;
  }
  return null;
}

export function buildUi(
  project: PlannerProjectV1,
  ui: Partial<UiState> = {},
): UiState {
  const selectedCalendarEntry =
    ui.selectedCalendarEntry &&
    project.library.books[ui.selectedCalendarEntry.bookId]
      ? ui.selectedCalendarEntry
      : null;
  return {
    ...DEFAULT_UI_STATE,
    ...ui,
    selectedBookId: ensureSelectedBook(
      project,
      ui.selectedBookId ?? DEFAULT_UI_STATE.selectedBookId,
    ),
    selectedCalendarEntry,
    calendarWeekIndex: Math.max(
      0,
      Math.round(ui.calendarWeekIndex ?? DEFAULT_UI_STATE.calendarWeekIndex),
    ),
    ganttView: ui.ganttView ?? project.uiPreferences.ganttView,
    ganttZoom: ui.ganttZoom ?? project.uiPreferences.ganttZoom,
    calendarLearningMode:
      ui.calendarLearningMode ?? project.uiPreferences.calendarLearningMode,
    planColorMode: ui.planColorMode ?? project.uiPreferences.planColorMode,
    planSections: ui.planSections ?? project.uiPreferences.planSections,
    libraryListWidthPx:
      ui.libraryListWidthPx ?? project.uiPreferences.libraryListWidthPx,
    openConstraintGroups:
      ui.openConstraintGroups ?? DEFAULT_UI_STATE.openConstraintGroups,
    selectedConstraintKey:
      ui.selectedConstraintKey ?? DEFAULT_UI_STATE.selectedConstraintKey,
    graphOptionsOpen: ui.graphOptionsOpen ?? DEFAULT_UI_STATE.graphOptionsOpen,
    bookSearchQuery: ui.bookSearchQuery ?? DEFAULT_UI_STATE.bookSearchQuery,
    bookSearchStatus: ui.bookSearchStatus ?? DEFAULT_UI_STATE.bookSearchStatus,
    bookSearchResults:
      ui.bookSearchResults ?? DEFAULT_UI_STATE.bookSearchResults,
    bookSearchHasMore:
      ui.bookSearchHasMore ?? DEFAULT_UI_STATE.bookSearchHasMore,
    bookSearchOffset: ui.bookSearchOffset ?? DEFAULT_UI_STATE.bookSearchOffset,
    bookSearchError: ui.bookSearchError ?? DEFAULT_UI_STATE.bookSearchError,
    importExportText: ui.importExportText ?? serializeProject(project),
    importExportDirty:
      ui.importExportDirty ?? DEFAULT_UI_STATE.importExportDirty,
    qbittorrentConnection:
      ui.qbittorrentConnection ?? DEFAULT_UI_STATE.qbittorrentConnection,
    qbittorrentStatus:
      ui.qbittorrentStatus ?? DEFAULT_UI_STATE.qbittorrentStatus,
    documentReader: ui.documentReader ?? DEFAULT_UI_STATE.documentReader,
    documentCandidates:
      ui.documentCandidates ?? DEFAULT_UI_STATE.documentCandidates,
    aiPrompt: ui.aiPrompt ?? DEFAULT_UI_STATE.aiPrompt,
    aiConnection: ui.aiConnection ?? DEFAULT_UI_STATE.aiConnection,
    aiSettingsRevision:
      ui.aiSettingsRevision ?? DEFAULT_UI_STATE.aiSettingsRevision,
    aiStatus: ui.aiStatus ?? DEFAULT_UI_STATE.aiStatus,
    aiProposal: ui.aiProposal ?? DEFAULT_UI_STATE.aiProposal,
    aiClarificationStatus:
      ui.aiClarificationStatus ?? DEFAULT_UI_STATE.aiClarificationStatus,
    aiClarificationMessages:
      ui.aiClarificationMessages ?? DEFAULT_UI_STATE.aiClarificationMessages,
    aiClarificationAnswers:
      ui.aiClarificationAnswers ?? DEFAULT_UI_STATE.aiClarificationAnswers,
    aiRelationshipStatus:
      ui.aiRelationshipStatus ?? DEFAULT_UI_STATE.aiRelationshipStatus,
    aiRelationshipWizard:
      ui.aiRelationshipWizard ?? createDefaultAiRelationshipWizardState(),
    aiRelationshipProposal:
      ui.aiRelationshipProposal ?? DEFAULT_UI_STATE.aiRelationshipProposal,
    autopilotDraft:
      ui.autopilotDraft ??
      createDefaultAutopilotWizardState(project.constraints),
    autopilotProposal:
      ui.autopilotProposal ?? DEFAULT_UI_STATE.autopilotProposal,
    debugUi: ui.debugUi ?? DEFAULT_UI_STATE.debugUi,
    banner: ui.banner ?? DEFAULT_UI_STATE.banner,
    dialog: ui.dialog ?? DEFAULT_UI_STATE.dialog,
  };
}

export function updateEnrichmentCache(
  projectToUpdate: PlannerProjectV1,
  bookId: string,
  patch: Partial<EnrichmentCacheEntry>,
): PlannerProjectV1 {
  return {
    ...projectToUpdate,
    enrichmentCache: {
      ...projectToUpdate.enrichmentCache,
      [bookId]: {
        ...(projectToUpdate.enrichmentCache[bookId] ?? {
          status: 'idle',
          bookId,
          cacheKey: bookId,
        }),
        ...patch,
      },
    },
  };
}
