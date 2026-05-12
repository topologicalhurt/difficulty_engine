import type { LibraryViewModel } from '../app/selectors/library';
import type { ConstraintSet, PlannerStore } from '../core/types';
import { badge, button, card, el, emptyState } from './dom';
import { selectInput } from './form-controls';
import { formatCssPercent, round0 } from './format';
import { renderProgressBar } from './progress';

function renderEnrichmentProgress(
  progress: LibraryViewModel['enrichmentProgress'],
): HTMLElement | null {
  if (
    !progress.total ||
    (!progress.loading && !progress.ready && !progress.failed)
  )
    return null;
  const completed = progress.ready + progress.failed;
  const percent = progress.total ? completed / progress.total : 0;
  const fill = el('div', { className: 'progress-fill' });
  fill.style.width = formatCssPercent(percent);
  const subBars = [
    { label: 'active workers', value: progress.loading, tone: 'info' },
    { label: 'ready', value: progress.ready, tone: 'success' },
    { label: 'failed', value: progress.failed, tone: 'danger' },
    { label: 'waiting', value: progress.idle, tone: 'neutral' },
  ];
  return el(
    'div',
    { className: 'enrichment-progress' },
    el(
      'div',
      { className: 'progress-head' },
      el('span', { text: 'Enrichment progress' }),
      el('strong', { text: `${round0(percent * 100)}%` }),
    ),
    el('div', { className: 'progress-track', role: 'progressbar' }, fill),
    el(
      'div',
      { className: 'enrichment-subprogress' },
      ...subBars.map((item) =>
        el(
          'div',
          { className: `subprogress subprogress-${item.tone}` },
          el('span', { text: item.label }),
          el('strong', { text: String(item.value) }),
        ),
      ),
    ),
  );
}

export function renderReadingListPanel(
  viewModel: LibraryViewModel,
  store: PlannerStore,
): HTMLElement {
  const books = viewModel.readingList;

  if (!books.length) {
    return card(
      'Reading list',
      emptyState('No books yet', 'Start by adding books to build a plan.'),
      button('Add first book', {
        className: 'primary-button',
        onClick: () => store.commands.addBook(),
      }),
    );
  }

  return card(
    'Reading list',
    el(
      'div',
      { className: 'list-toolbar' },
      button('Add book', {
        className: 'primary-button',
        onClick: () => store.commands.addBook(),
      }),
      button('Refresh all enrichment', {
        className: 'ghost-button',
        onClick: () => void store.commands.refreshAllEnrichment(),
      }),
      selectInput(
        viewModel.orderPolicy,
        [
          { value: 'auto', label: 'Auto order' },
          { value: 'prefer', label: 'Prefer list order' },
          { value: 'enforce', label: 'Enforce list order' },
        ],
        {
          className: 'select-input compact-select',
          onChange: (event) =>
            store.commands.updateConstraint(
              'bookOrderPolicy',
              (event.target as HTMLSelectElement)
                .value as ConstraintSet['bookOrderPolicy'],
            ),
        },
      ),
      el('div', {
        className: 'muted-copy',
        text: `${books.length} books · arrows shuffle list order; owned books stay before not-owned books`,
      }),
    ),
    renderEnrichmentProgress(viewModel.enrichmentProgress),
    el(
      'div',
      { className: 'book-list' },
      ...books.map((book) =>
        el(
          'div',
          {
            className: `book-list-item${book.selected ? ' selected' : ''}`,
            onClick: () => store.commands.selectBook(book.id),
          },
          el(
            'div',
            { className: 'book-list-top' },
            button(book.short, {
              className: 'book-title-button',
              onClick: () => store.commands.selectBook(book.id),
            }),
            el(
              'div',
              { className: 'book-badge-grid' },
              ...book.badges.map((item) => badge(item.label, item.tone)),
            ),
          ),
          el('div', { className: 'muted-copy', text: book.meta }),
          renderProgressBar(book.progress, { compact: true }),
          el('div', { className: 'muted-copy' }, book.detail),
          el(
            'div',
            { className: 'book-order-actions' },
            button('↑', {
              className: 'ghost-button compact-button',
              disabled: !book.canMoveUp,
              onClick: () => store.commands.moveBook(book.id, 'up'),
            }),
            button('↓', {
              className: 'ghost-button compact-button',
              disabled: !book.canMoveDown,
              onClick: () => store.commands.moveBook(book.id, 'down'),
            }),
            button(book.owned ? 'Owned' : 'Not owned', {
              className: book.owned
                ? 'ghost-button compact-button'
                : 'ghost-button compact-button warn-button',
              onClick: () =>
                store.commands.updateBook(book.id, { owned: !book.owned }),
            }),
          ),
        ),
      ),
    ),
  );
}
