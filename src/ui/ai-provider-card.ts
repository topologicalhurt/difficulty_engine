import { selectAiRecommendationViewModel } from '../app/selectors/ai-recommendations';
import type { AppState, PlannerStore } from '../core/types';
import { card, el } from './dom';
import {
  checkboxControl,
  inputField,
  selectInput,
  textInputControl,
} from './form-controls';

export function renderAiProviderCard(
  state: AppState,
  store: PlannerStore,
): HTMLElement {
  const viewModel = selectAiRecommendationViewModel(state);
  const connection = viewModel.connection;
  return card(
    'AI provider',
    el(
      'div',
      { className: 'form-grid' },
      inputField(
        'Enabled',
        checkboxControl({
          checked: connection.enabled,
          onChange: (enabled) =>
            store.commands.updateAiLocalSettings({ enabled }),
        }),
        'The recommender stays inert until explicitly enabled.',
      ),
      inputField(
        'Provider',
        selectInput(connection.provider, viewModel.providerOptions, {
          className: 'select-input',
          onChange: (event) => {
            if (event.target instanceof HTMLSelectElement) {
              store.commands.updateAiLocalSettings({
                provider: event.target.value as typeof connection.provider,
              });
            }
          },
        }),
        'OpenAI uses the Responses API. Anthropic uses the Messages API.',
      ),
      inputField(
        'Model',
        textInputControl({
          value: connection.model,
          focusKey: 'ai:model',
          placeholder:
            connection.provider === 'anthropic'
              ? 'claude-sonnet-4-5'
              : 'gpt-5-mini',
          onInput: (model) => store.commands.updateAiLocalSettings({ model }),
        }),
      ),
      inputField(
        'Endpoint override',
        textInputControl({
          value: connection.endpointUrl,
          focusKey: 'ai:endpointUrl',
          placeholder:
            'Leave blank for provider default, or use a host proxy endpoint',
          onInput: (endpointUrl) =>
            store.commands.updateAiLocalSettings({ endpointUrl }),
        }),
        'Use a host proxy for website embedding so API keys are not exposed to browsers.',
      ),
      inputField(
        'API key',
        textInputControl({
          type: 'password',
          value: connection.apiKey,
          focusKey: 'ai:apiKey',
          placeholder: 'Stored only for this app session',
          onInput: (apiKey) => store.commands.updateAiLocalSettings({ apiKey }),
        }),
        viewModel.secretStorageNote,
      ),
      inputField(
        'Output token cap',
        textInputControl({
          type: 'number',
          value: String(connection.maxOutputTokens),
          focusKey: 'ai:maxOutputTokens',
          onInput: (value) =>
            store.commands.updateAiLocalSettings({
              maxOutputTokens: Number(value),
            }),
        }),
        'Caps response size so requests stay bounded.',
      ),
    ),
  );
}
