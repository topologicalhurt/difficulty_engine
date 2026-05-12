import type { BookEditorViewModel } from '../app/selectors/library';
import type { AppState, BookRecord, PlannerStore } from '../core/types';
import { button, card, el, emptyState } from './dom';
import {
  renderBookEvidenceFields,
  renderBookFlagFields,
  renderBookMetadataFields,
  renderBookReadingScopeFields,
} from './library-editor-fields';
import {
  renderBookDetailToolbar,
  renderBookIdNote,
  renderBookPlanningInspector,
} from './library-editor-summary';
import { renderBookDocumentsPanel } from './library-documents-panel';
import {
  renderBookRelationSelector,
  renderRelationChips,
} from './library-relations-panel';

export function renderBookEditorPanel(
  state: AppState,
  model: BookEditorViewModel,
  store: PlannerStore,
): HTMLElement {
  const book = model.book;
  if (!book) {
    return card(
      'Book details',
      emptyState(
        'Select a book',
        'Choose a book from the library to edit its metadata and inspect its planning status.',
      ),
    );
  }

  const update = (patch: Partial<BookRecord>): void =>
    store.commands.updateBook(book.id, patch);

  return card(
    'Book details',
    el(
      'div',
      { className: 'toolbar-row book-details-toolbar' },
      button('Close details', {
        className: 'ghost-button compact-button',
        onClick: () => store.commands.selectBook(null),
      }),
    ),
    renderBookDetailToolbar(state, book, store),
    renderBookMetadataFields(book, update),
    card(
      'Relationships',
      renderBookRelationSelector(
        'Prerequisites',
        'Select books that must come before this book.',
        book,
        model.allBooks,
        model.relationSelectors.prereqs.selectedIds,
        model.relationSelectors.prereqs.graphIds,
        model.relationSelectors.prereqs.manualIds,
        (manualPrereqs) =>
          store.commands.updateBookRelations(book.id, { manualPrereqs }),
      ),
      renderBookRelationSelector(
        'Required by',
        'Select books that should come after this book. This is the outgoing graph view of prerequisites.',
        book,
        model.allBooks,
        model.relationSelectors.dependents.selectedIds,
        model.relationSelectors.dependents.graphIds,
        model.relationSelectors.dependents.manualIds,
        (manualDependents) =>
          store.commands.updateBookRelations(book.id, { manualDependents }),
      ),
      renderBookRelationSelector(
        'Co-study links',
        'Select books that should be planned together when feasible.',
        book,
        model.allBooks,
        model.relationSelectors.coStudy.selectedIds,
        model.relationSelectors.coStudy.graphIds,
        model.relationSelectors.coStudy.manualIds,
        (manualCoStudy) =>
          store.commands.updateBookRelations(book.id, { manualCoStudy }),
      ),
    ),
    renderBookFlagFields(book, update),
    renderBookEvidenceFields(book, update),
    card(
      'Reading scope',
      renderBookReadingScopeFields(book, model.readingScope, store),
    ),
    renderBookPlanningInspector(book, model),
    renderBookDocumentsPanel(state, book, store),
    renderRelationChips('Outgoing relations', model.outgoingRelations),
    renderBookIdNote(book),
  );
}
