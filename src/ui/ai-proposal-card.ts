import { selectAiRecommendationViewModel } from '../app/selectors/ai-recommendations';
import type { AiRecommendedBook, AppState, PlannerStore } from '../core/types';
import { compactJoin } from '../core/utils';
import { badge, button, card, el } from './dom';
import { formatOneDecimal, formatPages } from './format';

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
          text: compactJoin(
            [
              book.authors.join(', ') || 'Unknown author',
              book.pages ? `${formatPages(book.pages)} pages` : 'pages unknown',
              `difficulty seed ${formatOneDecimal(book.manualSeedDifficulty)}`,
            ],
            ' · ',
          ),
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

function proposalDiffLine(prefix: '+' | '~', text: string): HTMLElement {
  return el(
    'div',
    { className: `ai-diff-line ai-diff-${prefix === '+' ? 'add' : 'meta'}` },
    el('span', { className: 'ai-diff-prefix', text: prefix }),
    el('span', { text }),
  );
}

function proposalDiffView(books: AiRecommendedBook[]): HTMLElement {
  return el(
    'div',
    { className: 'ai-diff-view' },
    el('div', { className: 'diff-pane-label', text: 'Reading list diff' }),
    ...books.flatMap((book) => [
      proposalDiffLine(
        '+',
        `${book.title}${book.authors.length ? ` - ${book.authors.join(', ')}` : ''}`,
      ),
      ...book.prerequisiteIds.map((id) =>
        proposalDiffLine('~', `adds prerequisite edge from ${id}`),
      ),
      ...book.coStudyIds.map((id) =>
        proposalDiffLine('~', `adds co-study link with ${id}`),
      ),
    ]),
  );
}

function projectSettingsView(
  proposal: NonNullable<AppState['ui']['aiProposal']>,
): HTMLElement | null {
  if (!proposal.projectSettings.length) return null;
  return el(
    'div',
    { className: 'ai-diff-view' },
    el('div', { className: 'diff-pane-label', text: 'Project setting suggestions' }),
    ...proposal.projectSettings.map((setting) =>
      proposalDiffLine(
        '~',
        `${setting.key}: ${setting.currentValue || 'current'} -> ${setting.suggestedValue} (${formatOneDecimal(setting.confidence * 10)}/10)${setting.rationale ? ` - ${setting.rationale}` : ''}`,
      ),
    ),
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
    projectSettingsView(viewModel.proposal),
    proposalDiffView(viewModel.proposal.books),
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
