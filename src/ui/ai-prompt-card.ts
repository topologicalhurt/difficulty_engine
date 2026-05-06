import { selectAiRecommendationViewModel } from '../app/selectors/ai-recommendations';
import type { AppState, PlannerStore } from '../core/types';
import { button, card, el } from './dom';
import { textAreaControl } from './form-controls';

export function renderAiPromptCard(
  state: AppState,
  store: PlannerStore,
): HTMLElement {
  const viewModel = selectAiRecommendationViewModel(state);
  return card(
    'Recommendation prompt',
    el('p', {
      className: 'muted-copy',
      text: `Context batch: ${viewModel.contextSummary}`,
    }),
    textAreaControl({
      className: 'text-area ai-prompt-area',
      value: viewModel.prompt,
      placeholder:
        'Example: I own the electronics books already. Recommend the best next single book, including prerequisites if needed.',
      focusKey: 'ai-prompt',
      onInput: (prompt) => store.commands.setAiRecommendationPrompt(prompt),
    }),
    el(
      'div',
      { className: 'toolbar-row' },
      button(
        viewModel.status.state === 'loading'
          ? 'Requesting...'
          : 'Recommend books',
        {
          className: 'primary-button',
          disabled: viewModel.requestDisabled,
          onClick: () => {
            void store.commands.requestAiRecommendations();
          },
        },
      ),
      button('Clear proposal', {
        className: 'ghost-button',
        disabled: !viewModel.proposal,
        onClick: () => store.commands.clearAiRecommendation(),
      }),
    ),
    el('div', {
      className: `banner banner-${viewModel.status.state === 'failed' ? 'error' : 'info'}`,
      text: viewModel.status.message,
    }),
  );
}
