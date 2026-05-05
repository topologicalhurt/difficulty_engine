import type { AiRecommendationProviderKey, AppState } from '../../core/types';

export interface AiProviderOption {
  value: AiRecommendationProviderKey;
  label: string;
}

export interface AiRecommendationViewModel {
  prompt: string;
  status: AppState['ui']['aiStatus'];
  connection: AppState['ui']['aiConnection'];
  proposal: AppState['ui']['aiProposal'];
  maxSuggestions: number;
  providerOptions: AiProviderOption[];
  requestDisabled: boolean;
  applyDisabled: boolean;
  contextSummary: string;
  secretStorageNote: string;
}

export function selectAiRecommendationViewModel(
  state: AppState,
): AiRecommendationViewModel {
  const bookCount = Object.keys(state.project.library.books).length;
  const relationCount = state.snapshot.relations.length;
  return {
    prompt: state.ui.aiPrompt,
    status: state.ui.aiStatus,
    connection: state.ui.aiConnection,
    proposal: state.ui.aiProposal,
    maxSuggestions: state.project.aiRecommendationSettings.maxSuggestions,
    providerOptions: [
      { value: 'openai', label: 'ChatGPT / OpenAI' },
      { value: 'anthropic', label: 'Anthropic / Claude' },
    ],
    requestDisabled:
      state.ui.aiStatus.state === 'loading' ||
      !state.ui.aiPrompt.trim() ||
      !state.ui.aiConnection.enabled ||
      !state.ui.aiConnection.apiKey.trim(),
    applyDisabled: !state.ui.aiProposal?.books.length,
    contextSummary: `${bookCount} book(s), ${relationCount} relation(s), ${state.project.constraints.schedAlgo} schedule mode.`,
    secretStorageNote:
      'API keys are held in local UI state only and are not exported into the project JSON.',
  };
}
