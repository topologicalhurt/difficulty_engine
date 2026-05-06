import type { BookEditorViewModel } from '../app/selectors/library';
import type { AppState, BookRecord, PlannerStore } from '../core/types';
import { runConfirmableAction } from './confirmable-action';
import { badge, button, card, el } from './dom';
import { formatOneDecimal } from './format';
import { enrichmentBadge } from './library-controls';
import { renderEnrichmentProvenanceCard } from './library-provenance-panel';
import { renderRelationChips } from './library-relations-panel';
import { renderProgressBar } from './progress';

export function renderBookDetailToolbar(
  state: AppState,
  book: BookRecord,
  store: PlannerStore,
): HTMLElement {
  return el(
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
      onClick: () =>
        runConfirmableAction(store, {
          id: `library.remove.${book.id}`,
          message: `Click Remove book again to confirm deleting ${book.short || book.title}.`,
          action: () => store.commands.removeBook(book.id),
        }),
    }),
  );
}

export function renderBookPlanningInspector(
  book: BookRecord,
  model: BookEditorViewModel,
): HTMLElement {
  return el(
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
    renderEnrichmentProvenanceCard(
      book,
      model.enrichmentStatus,
      model.enrichmentError,
    ),
  );
}

export function renderBookIdNote(book: BookRecord): HTMLElement {
  return el(
    'div',
    { className: 'muted-copy' },
    `Book id: ${book.id}. Use existing book ids in prerequisite and co-study fields.`,
  );
}
