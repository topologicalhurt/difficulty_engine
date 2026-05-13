import type { AppState } from '../../core/types';
import { selectRenderableActiveView } from './shell';

function selectedCalendarEntryKey(state: AppState): string {
  const entry = state.ui.selectedCalendarEntry;
  return entry ? `${entry.dateKey}:${entry.bookId}` : '';
}

export function selectActiveTabRenderKeys(
  state: AppState,
): readonly unknown[] {
  const activeView = selectRenderableActiveView(state);
  switch (activeView) {
    case 'library':
      return [
        activeView,
        state.project,
        state.snapshot,
        state.ui.selectedBookId,
        state.ui.bookSearchQuery,
        state.ui.bookSearchStatus,
        state.ui.bookSearchResults,
        state.ui.bookSearchHasMore,
        state.ui.bookSearchOffset,
        state.ui.bookSearchError,
        state.ui.documentReader,
        state.ui.documentCandidates,
        state.ui.libraryListWidthPx,
      ];
    case 'constraints':
      return [
        activeView,
        state.project.constraints,
        state.snapshot,
        state.ui.openConstraintGroups,
        state.ui.selectedConstraintKey,
      ];
    case 'ai':
      return [
        activeView,
        state.project,
        state.snapshot,
        state.ui.aiPrompt,
        state.ui.aiConnection,
        state.ui.aiClarificationStatus,
        state.ui.aiClarificationMessages,
        state.ui.aiClarificationAnswers,
        state.ui.aiStatus,
        state.ui.aiProposal,
        state.ui.aiRelationshipStatus,
        state.ui.aiRelationshipWizard,
        state.ui.aiRelationshipProposal,
      ];
    case 'graphs':
      return [
        activeView,
        state.project.constraints,
        state.snapshot,
        state.ui.selectedBookId,
        state.ui.graphOptionsOpen,
      ];
    case 'diagnostics':
      return [activeView, state.snapshot];
    case 'project':
      return [
        activeView,
        state.project,
        state.ui.importExportText,
        state.ui.importExportDirty,
        state.ui.qbittorrentConnection,
        state.ui.qbittorrentStatus,
        state.ui.autopilotDraft,
        state.ui.autopilotProposal,
      ];
    case 'info':
      return [activeView];
    case 'plan':
    default:
      return [
        activeView,
        state.project,
        state.snapshot,
        state.ui.selectedBookId,
        selectedCalendarEntryKey(state),
        state.ui.ganttView,
        state.ui.ganttZoom,
        state.ui.planColorMode,
        state.ui.planSections,
        state.ui.bookSearchQuery,
        state.ui.bookSearchStatus,
        state.ui.bookSearchResults,
        state.ui.bookSearchHasMore,
        state.ui.bookSearchOffset,
        state.ui.bookSearchError,
      ];
  }
}
