import { selectAiRecommendationViewModel } from '../app/selectors/ai-recommendations';
import type {
  AiRecommendationWorkMode,
  AppState,
  PlannerStore,
} from '../core/types';
import { button, card, el } from './dom';
import {
  draftNumberInputControl,
  inputField,
  selectInput,
  textAreaControl,
  type SelectOption,
} from './form-controls';

const AI_WORK_MODE_OPTIONS: SelectOption[] = [
  { value: 'new_books', label: 'New books only' },
  { value: 'plan', label: 'Plan only' },
  { value: 'both', label: 'Books and plan' },
];

export function renderAiPromptCard(
  state: AppState,
  store: PlannerStore,
): HTMLElement {
  const viewModel = selectAiRecommendationViewModel(state);
  const settings = viewModel.settings;
  return card(
    'AI prompt',
    el('p', {
      className: 'muted-copy',
      text: `One prompt drives the selected AI work mode. Context batch: ${viewModel.contextSummary}`,
    }),
    textAreaControl({
      className: 'text-area ai-prompt-area',
      value: viewModel.prompt,
      placeholder:
        'Example: reorganize my reading list for deep foundations, prioritize electronics repair quickly, and keep some maths/programming in parallel.',
      focusKey: 'ai-prompt',
      onInput: (prompt) => store.commands.setAiRecommendationPrompt(prompt),
    }),
    el(
      'div',
      { className: 'two-column-grid' },
      inputField(
        'Recommendation count',
        draftNumberInputControl({
          value: settings.maxSuggestions,
          focusKey: 'ai:maxSuggestions',
          min: 1,
          max: 20,
          step: 1,
          onCommit: (maxSuggestions) =>
            store.commands.updateAiRecommendationSettings({ maxSuggestions }),
        }),
        'Maximum new-book proposals to request.',
      ),
      inputField(
        'DAG depth',
        draftNumberInputControl({
          value: settings.dagDepth,
          focusKey: 'ai:dagDepth',
          min: 0,
          max: 12,
          step: 1,
          onCommit: (dagDepth) =>
            store.commands.updateAiRecommendationSettings({ dagDepth }),
        }),
        'How many prerequisite/progression layers the AI should plan around.',
      ),
      inputField(
        'AI work mode',
        selectInput(settings.workMode, AI_WORK_MODE_OPTIONS, {
          onChange: (event) => {
            if (event.target instanceof HTMLSelectElement) {
              store.commands.updateAiRecommendationSettings({
                workMode: event.target.value as AiRecommendationWorkMode,
              });
            }
          },
        }),
        'Choose whether this tab asks for books, plan changes, or both.',
      ),
    ),
    renderClarificationCards(state, store),
    el(
      'div',
      { className: 'toolbar-row' },
      button(viewModel.workspaceRequestLabel, {
        className: 'primary-button',
        disabled: viewModel.workspaceRequestDisabled,
        onClick: () => {
          void store.commands.requestAiWorkspaceProposal();
        },
      }),
      button('Clear proposal', {
        className: 'ghost-button',
        disabled: !viewModel.proposal && !viewModel.relationshipProposal,
        onClick: () => {
          store.commands.clearAiRecommendation();
          store.commands.clearAiRelationshipProposal();
        },
      }),
      button('Clear question cards', {
        className: 'ghost-button',
        disabled: !viewModel.clarificationMessages.length,
        onClick: () => store.commands.clearAiClarification(),
      }),
    ),
    viewModel.clarificationStatus.state !== 'idle' ||
      viewModel.clarificationMessages.length
      ? el('div', {
          className: `banner banner-${viewModel.clarificationStatus.state === 'failed' ? 'error' : 'info'}`,
          text: viewModel.clarificationStatus.message,
        })
      : null,
    el('div', {
      className: `banner banner-${viewModel.status.state === 'failed' ? 'error' : 'info'}`,
      text: viewModel.status.message,
    }),
    el('div', {
      className: `banner banner-${viewModel.relationshipStatus.state === 'failed' ? 'error' : 'info'}`,
      text: viewModel.relationshipStatus.message,
    }),
  );
}

function renderClarificationCards(
  state: AppState,
  store: PlannerStore,
): HTMLElement | null {
  const viewModel = selectAiRecommendationViewModel(state);
  if (!viewModel.clarificationQuestions.length) return null;
  return el(
    'div',
    { className: 'ai-clarification-card-grid' },
    ...viewModel.clarificationQuestions.map((question, index) =>
      el(
        'article',
        { className: 'ai-clarification-card' },
        el('span', { className: 'badge badge-neutral', text: `Card ${index + 1}` }),
        el('p', { text: question.text }),
        textAreaControl({
          className: 'text-area',
          value: question.answer,
          rows: 3,
          focusKey: `ai:clarification:${question.messageIndex}`,
          placeholder: 'Answer this card...',
          onInput: (answer) =>
            store.commands.setAiClarificationAnswer(
              question.messageIndex,
              answer,
            ),
        }),
      ),
    ),
    el(
      'p',
      {
        className: 'muted-copy',
        text: 'Answer each card, then submit once. The answers are sent to both the book recommender and the plan proposer according to AI work mode.',
      },
    ),
  );
}
