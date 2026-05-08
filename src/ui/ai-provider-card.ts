import { selectAiRecommendationViewModel } from '../app/selectors/ai-recommendations';
import {
  bestAiModelMatch,
  defaultAiModel,
} from '../core/ai-provider-registry';
import type { AppState, PlannerStore } from '../core/types';
import { card, el } from './dom';
import {
  autocompleteTextInputControl,
  checkboxControl,
  draftNumberInputControl,
  inputField,
  selectInput,
  textInputControl,
} from './form-controls';

const apiKeyLockedByStore = new WeakMap<PlannerStore, boolean>();

export function renderAiProviderCard(
  state: AppState,
  store: PlannerStore,
): HTMLElement {
  const viewModel = selectAiRecommendationViewModel(state);
  const connection = viewModel.connection;
  if (!apiKeyLockedByStore.has(store)) {
    apiKeyLockedByStore.set(store, Boolean(connection.apiKey.trim()));
  }
  const apiKeyLocked =
    Boolean(connection.apiKey.trim()) &&
    Boolean(apiKeyLockedByStore.get(store));
  const acceptModel = (model: string): void => {
    const match = bestAiModelMatch(model);
    store.commands.updateAiLocalSettings({
      model: match?.model ?? model,
      ...(match && match.provider !== connection.provider
        ? { provider: match.provider }
        : {}),
    });
  };
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
        autocompleteTextInputControl({
          value: connection.model,
          focusKey: 'ai:model',
          placeholder: defaultAiModel(connection.provider),
          options: viewModel.modelSuggestions.map((suggestion) => ({
            value: suggestion.model,
            label: suggestion.label,
            detail: suggestion.provider,
          })),
          onInput: (model) => {
            const match = bestAiModelMatch(model);
            store.commands.updateAiLocalSettings({
              model,
              ...(match &&
              match.provider !== connection.provider &&
              model.trim().length >= 4
                ? { provider: match.provider }
                : {}),
            });
          },
          onAccept: acceptModel,
        }),
        viewModel.modelSuggestion
          ? `Nearest maintained model: ${viewModel.modelSuggestion}`
          : 'Use a maintained model id or provider alias.',
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
        el(
          'div',
          { className: 'stack-layout compact-stack' },
          textInputControl({
            type: 'password',
            value: connection.apiKey,
            focusKey: 'ai:apiKey',
            placeholder: 'Stored only for this app session',
            className: apiKeyLocked ? 'text-input locked-input' : 'text-input',
            disabled: apiKeyLocked,
            onInput: (apiKey) =>
              store.commands.updateAiLocalSettings({ apiKey }),
          }),
          connection.apiKey.trim()
            ? el(
                'label',
                { className: 'inline-control muted-copy' },
                checkboxControl({
                  checked: apiKeyLocked,
                  onChange: (locked) => {
                    apiKeyLockedByStore.set(store, locked);
                    store.commands.setBanner({
                      tone: 'info',
                      message: locked
                        ? 'AI API key field locked.'
                        : 'AI API key field unlocked for editing.',
                    });
                  },
                }),
                el('span', { text: 'Lock API key field' }),
              )
            : null,
        ),
        viewModel.secretStorageNote,
      ),
      inputField(
        'Output token cap',
        draftNumberInputControl({
          value: connection.maxOutputTokens,
          focusKey: 'ai:maxOutputTokens',
          onCommit: (maxOutputTokens) =>
            store.commands.updateAiLocalSettings({
              maxOutputTokens,
            }),
          min: 256,
          max: 8000,
          step: 128,
        }),
        'Caps response size so requests stay bounded.',
      ),
    ),
  );
}
