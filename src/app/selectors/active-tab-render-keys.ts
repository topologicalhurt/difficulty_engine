import type { AppState } from '../../core/types';

function selectedCalendarEntryKey(state: AppState): string {
  const entry = state.ui.selectedCalendarEntry;
  return entry ? `${entry.dateKey}:${entry.bookId}` : '';
}

export function selectActiveTabRenderKeys(
  state: AppState,
): readonly unknown[] {
  switch (state.ui.activeView) {
    case 'library':
      return [
        state.ui.activeView,
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
      ];
    case 'constraints':
      return [
        state.ui.activeView,
        state.project.constraints,
        state.snapshot,
        state.ui.openConstraintGroups,
        state.ui.selectedConstraintKey,
      ];
    case 'ai':
      return [
        state.ui.activeView,
        state.project,
        state.snapshot,
        state.ui.aiPrompt,
        state.ui.aiConnection,
        state.ui.aiStatus,
        state.ui.aiProposal,
      ];
    case 'graphs':
      return [
        state.ui.activeView,
        state.project.constraints,
        state.snapshot,
        state.ui.selectedBookId,
      ];
    case 'diagnostics':
      return [state.ui.activeView, state.snapshot];
    case 'project':
      return [
        state.ui.activeView,
        state.project,
        state.ui.importExportText,
        state.ui.importExportDirty,
        state.ui.qbittorrentConnection,
        state.ui.qbittorrentStatus,
      ];
    case 'info':
      return [state.ui.activeView];
    case 'plan':
    default:
      return [
        state.ui.activeView,
        state.project,
        state.snapshot,
        state.ui.selectedBookId,
        selectedCalendarEntryKey(state),
        state.ui.ganttView,
        state.ui.ganttZoom,
        state.ui.planColorMode,
        state.ui.bookSearchQuery,
        state.ui.bookSearchStatus,
        state.ui.bookSearchResults,
        state.ui.bookSearchHasMore,
        state.ui.bookSearchOffset,
        state.ui.bookSearchError,
      ];
  }
}
