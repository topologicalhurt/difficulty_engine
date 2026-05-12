import type { AiRecommendationProviderKey, AppState } from '../../core/types';
import {
  aiModelOptions,
  aiProviderOptions,
  rankedAiModelMatches,
  resolveAiModelInput,
} from '../../core/ai-provider-registry';

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
  modelSuggestions: Array<{
    provider: AiRecommendationProviderKey;
    model: string;
    label: string;
  }>;
  requestDisabled: boolean;
  applyDisabled: boolean;
  contextSummary: string;
  secretStorageNote: string;
  apiKeyIndicator: string;
  modelOptions: string[];
  modelSuggestion: string | null;
}

export function selectAiRecommendationViewModel(
  state: AppState,
): AiRecommendationViewModel {
  const bookCount = Object.keys(state.project.library.books).length;
  const relationCount = state.snapshot.relations.length;
  const modelResolution = resolveAiModelInput(
    state.ui.aiConnection.model,
    state.ui.aiConnection.provider,
  );
  const modelSuggestion =
    modelResolution.confidence === 'none' ||
    modelResolution.model === state.ui.aiConnection.model
      ? null
      : modelResolution.model;
  return {
    prompt: state.ui.aiPrompt,
    status: state.ui.aiStatus,
    connection: state.ui.aiConnection,
    proposal: state.ui.aiProposal,
    maxSuggestions: state.project.aiRecommendationSettings.maxSuggestions,
    providerOptions: aiProviderOptions(),
    modelSuggestions: rankedAiModelMatches(state.ui.aiConnection.model).map(
      (item) => ({
        provider: item.provider,
        model: item.model,
        label: item.label,
      }),
    ),
    requestDisabled:
      state.ui.aiStatus.state === 'loading' ||
      !state.ui.aiPrompt.trim() ||
      !state.ui.aiConnection.enabled ||
      !state.ui.aiConnection.apiKey.trim(),
    applyDisabled: !state.ui.aiProposal?.books.length,
    contextSummary: `${bookCount} book(s), ${relationCount} relation(s), ${state.project.constraints.schedAlgo} schedule mode.`,
    secretStorageNote:
      'API keys are held in local UI state only and are not exported into the project JSON.',
    apiKeyIndicator: state.ui.aiConnection.apiKey.trim()
      ? 'API key loaded for this session.'
      : state.ui.aiConnection.enabled
        ? 'No API key loaded.'
        : 'No API key loaded; provider is disabled.',
    modelOptions: aiModelOptions(),
    modelSuggestion,
  };
}
