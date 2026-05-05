import { selectAiRecommendationViewModel } from '../app/selectors/ai-recommendations';
import type { AiRecommendedBook, AppState, PlannerStore } from '../core/types';
import { badge, button, card, el } from './dom';

function relationBadges(book: AiRecommendedBook): HTMLElement {
  const prereq = book.prerequisiteIds.length
    ? badge(`prereqs: ${book.prerequisiteIds.join(', ')}`, 'warn')
    : null;
  const coStudy = book.coStudyIds.length
    ? badge(`co-study: ${book.coStudyIds.join(', ')}`, 'success')
    : null;
  return el(
    'div',
    { className: 'badge-row compact-badge-row' },
    prereq,
    coStudy,
  );
}

function proposalBookCard(book: AiRecommendedBook): HTMLElement {
  return el(
    'article',
    { className: 'search-result-card ai-proposal-card' },
    el(
      'div',
      { className: 'search-result-top' },
      el(
        'div',
        { className: 'stack-layout compact-stack' },
        el('strong', { text: book.title }),
        el('span', {
          className: 'muted-copy',
          text: [
            book.authors.join(', ') || 'Unknown author',
            book.pages ? `${book.pages} pages` : 'pages unknown',
            `difficulty seed ${book.manualSeedDifficulty.toFixed(1)}`,
          ].join(' · '),
        }),
      ),
      badge(book.displayGroup),
    ),
    book.subjects.length
      ? el(
          'div',
          { className: 'badge-row compact-badge-row' },
          ...book.subjects.map((subject) => badge(subject)),
        )
      : null,
    relationBadges(book),
    el('p', {
      className: 'muted-copy',
      text: book.rationale || 'No rationale supplied.',
    }),
  );
}

export function renderAiProposalCard(
  state: AppState,
  store: PlannerStore,
): HTMLElement {
  const viewModel = selectAiRecommendationViewModel(state);
  if (!viewModel.proposal) {
    return card(
      'Pending proposal',
      el('div', {
        className: 'empty-state',
        text: 'No AI proposal yet. Configure a provider, describe the gap in your reading list, then request a recommendation.',
      }),
    );
  }
  return card(
    'Pending proposal',
    el('p', { className: 'muted-copy', text: viewModel.proposal.summary }),
    viewModel.proposal.warnings.length
      ? el(
          'div',
          { className: 'warning-list' },
          ...viewModel.proposal.warnings.map((warning) =>
            el(
              'div',
              { className: 'warning-item warning-warn' },
              el('span', { text: warning }),
            ),
          ),
        )
      : null,
    el(
      'div',
      { className: 'search-results' },
      ...viewModel.proposal.books.map((book) => proposalBookCard(book)),
    ),
    el(
      'div',
      { className: 'toolbar-row' },
      button('Apply proposal to library', {
        className: 'primary-button',
        disabled: viewModel.applyDisabled,
        onClick: () => store.commands.applyAiRecommendation(),
      }),
      button('Discard', {
        className: 'ghost-button',
        onClick: () => store.commands.clearAiRecommendation(),
      }),
    ),
  );
}
