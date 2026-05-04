import type { AppState, PlannerStore } from '../core/types';
import { selectLibraryViewModel } from '../app/selectors/library';
import { el } from './dom';
import { renderBookEditorPanel } from './library-editor-panel';
import { renderReadingListPanel } from './library-list-panel';
import { renderLibrarySearchPanel } from './library-search-panel';

export function renderLibraryView(state: AppState, store: PlannerStore): HTMLElement {
  const viewModel = selectLibraryViewModel(state);

  return el(
    'div',
    { className: viewModel.selectedBook ? 'split-layout' : 'stack-layout' },
    el(
      'div',
      { className: 'stack-layout' },
      renderLibrarySearchPanel(state, store, { title: 'Search and import' }),
      renderReadingListPanel(state, store),
    ),
    viewModel.selectedBook
      ? renderBookEditorPanel(state, viewModel.selectedBook.id, store)
      : null,
  );
}
