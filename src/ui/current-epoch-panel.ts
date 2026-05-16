import type { selectPlanViewModel } from '../app/selectors/plan';
import type { PlannerStore } from '../core/types';
import { badge, card, el } from './dom';
import { formatPages, formatWholeNumber } from './format';

export function renderCurrentEpochPanel(
  viewModel: ReturnType<typeof selectPlanViewModel>,
  store: PlannerStore,
): HTMLElement {
  return card(
    viewModel.currentEpoch.title,
    el(
      'div',
      { className: 'stack-layout compact-stack' },
      el('strong', { text: viewModel.currentEpoch.label }),
      el('span', {
        className: 'muted-copy',
        text: `${viewModel.currentEpoch.modeLabel} · ${viewModel.currentEpoch.hint}`,
      }),
      viewModel.currentEpoch.books.length
        ? el('span', {
            className: 'muted-copy',
            text: 'An epoch is the longest contiguous study window with the same active book set.',
          })
        : null,
    ),
    viewModel.currentEpoch.books.length
      ? el(
          'div',
          { className: 'search-results compact-results' },
          ...viewModel.currentEpoch.books.map((book) =>
            el(
              'button',
              {
                className: `search-result-card epoch-book-card${book.selected ? ' selected' : ''}`,
                onClick: () => store.commands.selectBook(book.id),
              },
              el(
                'div',
                { className: 'search-result-top' },
                el('strong', { text: book.short }),
                badge(book.done ? 'Done' : book.displayGroup),
              ),
              el('span', {
                className: 'muted-copy',
                text: `${formatWholeNumber(book.minutes)} min · ${formatPages(book.pages)} page(s)`,
              }),
            ),
          ),
        )
      : el('div', {
          className: 'empty-state',
          text: 'No active books in the current study window.',
        }),
  );
}
