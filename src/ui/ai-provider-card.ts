import { selectAiRecommendationViewModel } from '../app/selectors/ai-recommendations';
import {
  bestAiModelMatch,
  defaultAiModel,
} from '../core/ai-provider-registry';
import type { AiReasoningMode, AppState, PlannerStore } from '../core/types';
import {
  browserPasswordManagerAvailable,
  recallAiApiKey,
  rememberAiApiKey,
} from './ai-api-key-vault';
import { button, card, el } from './dom';
import {
  autocompleteTextInputControl,
  checkboxControl,
  draftNumberInputControl,
  inputField,
  optionalDraftNumberInputControl,
  selectInput,
  textInputControl,
} from './form-controls';

const apiKeyLockedByStore = new WeakMap<PlannerStore, boolean>();
const AI_REASONING_MODE_OPTIONS: Array<{
  value: AiReasoningMode;
  label: string;
}> = [
  { value: 'provider_default', label: 'Provider default' },
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Extra high' },
];

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
          onInput: (model) => store.commands.updateAiLocalSettings({ model }),
          onAccept: acceptModel,
        }),
        viewModel.modelSuggestion
          ? `Nearest maintained model: ${viewModel.modelSuggestion}. Press Tab or Enter to accept.`
          : 'Type freely; maintained model suggestions are accepted only with Tab, Enter, or click.',
      ),
      inputField(
        'Thinking mode',
        selectInput(connection.reasoningMode, AI_REASONING_MODE_OPTIONS, {
          className: 'select-input',
          onChange: (event) => {
            if (event.target instanceof HTMLSelectElement) {
              store.commands.updateAiLocalSettings({
                reasoningMode: event.target.value as AiReasoningMode,
              });
            }
          },
        }),
        'OpenAI models receive this as reasoning effort; other providers receive it as request context.',
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
            name: 'password',
            autocomplete: 'current-password',
            placeholder: 'Stored only for this app session',
            className: apiKeyLocked ? 'text-input locked-input' : 'text-input',
            disabled: apiKeyLocked,
            onInput: (apiKey) =>
              store.commands.updateAiLocalSettings({ apiKey }),
          }),
          textInputControl({
            className: 'hidden-file-input',
            type: 'text',
            name: 'username',
            autocomplete: 'username',
            value: `difficulty-engine-ai:${connection.provider}`,
            focusKey: 'ai:apiKeyUsername',
            onInput: () => undefined,
          }),
          el(
            'div',
            { className: 'toolbar-row' },
            button('Recall saved key', {
              className: 'ghost-button',
              disabled: !browserPasswordManagerAvailable(),
              onClick: async () => {
                try {
                  const apiKey = await recallAiApiKey(connection);
                  store.commands.updateAiLocalSettings({ apiKey });
                  store.commands.setBanner({
                    tone: 'success',
                    message: 'AI API key recalled from the browser password manager.',
                  });
                } catch (error) {
                  store.commands.setBanner({
                    tone: 'warn',
                    message:
                      error instanceof Error
                        ? error.message
                        : 'Could not recall AI API key.',
                  });
                }
              },
            }),
            button('Remember key', {
              className: 'ghost-button',
              disabled:
                !browserPasswordManagerAvailable() ||
                !connection.apiKey.trim(),
              onClick: async () => {
                try {
                  await rememberAiApiKey(connection);
                  store.commands.setBanner({
                    tone: 'success',
                    message:
                      'AI API key handed to the browser password manager.',
                  });
                } catch (error) {
                  store.commands.setBanner({
                    tone: 'warn',
                    message:
                      error instanceof Error
                        ? error.message
                        : 'Could not save AI API key with the browser.',
                  });
                }
              },
            }),
          ),
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
        optionalDraftNumberInputControl({
          value: connection.maxOutputTokens,
          focusKey: 'ai:maxOutputTokens',
          onCommit: (maxOutputTokens) =>
            store.commands.updateAiLocalSettings({
              maxOutputTokens,
            }),
          min: 256,
          step: 128,
          emptyLabel: 'Unlimited / provider default',
        }),
        'Leave empty to send the full request and let the provider/model decide.',
      ),
      inputField(
        'Request timeout',
        draftNumberInputControl({
          value: Math.round(connection.timeoutMs / 1000),
          focusKey: 'ai:timeoutSeconds',
          min: 30,
          max: 900,
          step: 30,
          onCommit: (timeoutSeconds) =>
            store.commands.updateAiLocalSettings({
              timeoutMs: timeoutSeconds * 1000,
            }),
        }),
        'Seconds before cancelling provider calls. Relationship planning uses a longer safe minimum for large contexts.',
      ),
    ),
  );
}
