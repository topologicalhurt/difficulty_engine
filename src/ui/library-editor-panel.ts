import { EXAMPLE_BOOK } from '../core/defaults';
import { selectBookEditorViewModel } from '../app/selectors/library';
import type { AppState, BookRecord, PlannerStore } from '../core/types';
import { badge, button, card, el, emptyState, inputField } from './dom';
import { formatOneDecimal, joinCsv } from './format';
import { checkboxInput, enrichmentBadge, numberInput, textInput } from './library-controls';
import { renderBookDocumentsPanel } from './library-documents-panel';
import { renderBookRelationSelector, renderRelationChips } from './library-relations-panel';
import { renderEnrichmentProvenanceCard } from './library-provenance-panel';
import { renderProgressBar } from './progress';

export function renderBookEditorPanel(
  state: AppState,
  bookId: string | null,
  store: PlannerStore,
): HTMLElement {
  const model = selectBookEditorViewModel(state, bookId);
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

  const update = (patch: Partial<BookRecord>): void => store.commands.updateBook(book.id, patch);

  return card(
    'Book details',
    el(
      'div',
      { className: 'detail-toolbar' },
      badge(book.displayGroup || 'Ungrouped'),
      badge(`${book.pages} pages`),
      badge(`Seed ${formatOneDecimal(book.manualSeedDifficulty)}`),
      enrichmentBadge(state, book.id),
      el('div', { className: 'detail-spacer' }),
      button('Refresh enrichment', {
        className: 'ghost-button',
        onClick: () => void store.commands.refreshBookEnrichment(book.id),
      }),
      button('Remove book', {
        className: 'ghost-button danger-button',
        onClick: () => store.commands.removeBook(book.id),
      }),
    ),
    el(
      'div',
      { className: 'form-grid' },
      inputField('Title', textInput(book.title, (title) => update({ title }), '', `book:${book.id}:title`), 'Full book title.'),
      inputField('Short label', textInput(book.short, (short) => update({ short }), '', `book:${book.id}:short`), 'Compact label used in the planner.'),
      inputField(
        'Authors',
        textInput(
          joinCsv(book.authors),
          (value) => update({ authors: value.split(',').map((part) => part.trim()).filter(Boolean) }),
          '',
          `book:${book.id}:authors`,
        ),
        'Comma-separated authors.',
      ),
      inputField(
        'Display group',
        textInput(book.displayGroup, (displayGroup) => update({ displayGroup }), '', `book:${book.id}:displayGroup`),
        'Purely visual grouping; does not affect inference.',
      ),
      inputField('Pages', numberInput(book.pages, (pages) => update({ pages }), 1, 4000, 1, `book:${book.id}:pages`), 'Total page count.'),
      inputField(
        'Seed difficulty',
        numberInput(book.manualSeedDifficulty, (manualSeedDifficulty) => update({ manualSeedDifficulty }), 1, 10, 0.1, `book:${book.id}:manualSeedDifficulty`),
        'Manual intrinsic difficulty seed.',
      ),
      inputField(
        'Subjects',
        textInput(
          joinCsv(book.subjects),
          (value) => update({ subjects: value.split(',').map((part) => part.trim()).filter(Boolean) }),
          '',
          `book:${book.id}:subjects`,
        ),
        'Comma-separated subject phrases.',
      ),
      inputField('Publisher', textInput(book.publisher, (publisher) => update({ publisher }), '', `book:${book.id}:publisher`), 'Optional metadata.'),
      inputField('ISBN', textInput(book.isbn ?? '', (isbn) => update({ isbn: isbn || null }), '', `book:${book.id}:isbn`), 'Optional metadata.'),
      inputField('Year', numberInput(book.year ?? 2024, (year) => update({ year }), 0, 9999, 1, `book:${book.id}:year`), 'Optional publication year.'),
      inputField(
        'Source PDF / URL',
        textInput(book.sourcePath ?? '', (sourcePath) => update({ sourcePath: sourcePath || null }), '', `book:${book.id}:sourcePath`),
        'Optional fetchable document source for future offline-first TOC extraction.',
      ),
      renderBookRelationSelector(
        'Prerequisites',
        'Select books that must come before this book.',
        book,
        model.allBooks,
        model.relationSelectors.prereqs.selectedIds,
        model.relationSelectors.prereqs.graphIds,
        model.relationSelectors.prereqs.manualIds,
        (manualPrereqs) => store.commands.updateBookRelations(book.id, { manualPrereqs }),
      ),
      renderBookRelationSelector(
        'Required by',
        'Select books that should come after this book. This is the outgoing graph view of prerequisites.',
        book,
        model.allBooks,
        model.relationSelectors.dependents.selectedIds,
        model.relationSelectors.dependents.graphIds,
        model.relationSelectors.dependents.manualIds,
        (manualDependents) => store.commands.updateBookRelations(book.id, { manualDependents }),
      ),
      renderBookRelationSelector(
        'Co-study links',
        'Select books that should be planned together when feasible.',
        book,
        model.allBooks,
        model.relationSelectors.coStudy.selectedIds,
        model.relationSelectors.coStudy.graphIds,
        model.relationSelectors.coStudy.manualIds,
        (manualCoStudy) => store.commands.updateBookRelations(book.id, { manualCoStudy }),
      ),
    ),
    el(
      'div',
      { className: 'flag-grid' },
      inputField('Allow prerequisite overlap', checkboxInput(book.allowPrereqOverlap, (allowPrereqOverlap) => update({ allowPrereqOverlap })), 'Manual override that allows overlap.'),
      inputField('Lock difficulty', checkboxInput(book.lockDiff, (lockDiff) => update({ lockDiff })), 'Freeze solver-adjusted difficulty.'),
      inputField('No propagation out', checkboxInput(book.noPropOut, (noPropOut) => update({ noPropOut })), 'Prevent this book from influencing later books.'),
      inputField('Owned now', checkboxInput(book.owned !== false, (owned) => update({ owned })), 'Books you have available are prioritized before books you do not own when list ordering is preferred or enforced.'),
      inputField('Ignored', checkboxInput(book.ignored, (ignored) => update({ ignored })), 'Exclude this book from planning.'),
      inputField('Completed', checkboxInput(book.completed, (completed) => update({ completed })), 'Treat this book as done.'),
      inputField('Constant background', checkboxInput(book.constantRD, (constantRD) => update({ constantRD })), 'Mark as constant research/defer background.'),
    ),
    el(
      'div',
      { className: 'form-grid' },
      inputField(
        'Chapter titles',
        (() => {
          const area = el('textarea', {
            className: 'text-area',
            value: book.enrichment.chapters.join('\n'),
            focusKey: `book:${book.id}:chapters`,
            onInput: (event) =>
              update({
                enrichment: {
                  ...book.enrichment,
                  chapters: (event.target as HTMLTextAreaElement).value.split('\n').map((line) => line.trim()).filter(Boolean),
                },
              }),
          });
          area.rows = 8;
          return area;
        })(),
        'One chapter title per line.',
      ),
      inputField(
        'Description',
        (() => {
          const area = el('textarea', {
            className: 'text-area',
            value: book.enrichment.description,
            focusKey: `book:${book.id}:description`,
            onInput: (event) =>
              update({
                enrichment: {
                  ...book.enrichment,
                  description: (event.target as HTMLTextAreaElement).value,
                },
              }),
          });
          area.rows = 8;
          return area;
        })(),
        'Used by the inference engine as generic corpus evidence.',
      ),
    ),
    el(
      'div',
      { className: 'triple-layout inspector-grid' },
      card(
        'Effective planning',
        model.progress ? renderProgressBar(model.progress) : null,
        el('div', { className: 'muted-copy', text: model.scheduleSummary }),
        el('div', { text: model.difficultySummary }),
        el('div', { text: model.dayPlanSummary }),
        el(
          'div',
          { className: 'badge-row' },
          ...model.planningBadges.map((item) => badge(item.label, item.tone)),
        ),
      ),
      renderRelationChips('Incoming relations', model.incomingRelations),
      renderEnrichmentProvenanceCard(book, model.enrichmentStatus, model.enrichmentError),
    ),
    renderBookDocumentsPanel(state, book, store),
    renderRelationChips('Outgoing relations', model.outgoingRelations),
    el(
      'div',
      { className: 'muted-copy' },
      `Book id: ${book.id}. Use ids in prerequisite and co-study fields. New books start from the example template: ${EXAMPLE_BOOK.title}.`,
    ),
  );
}
