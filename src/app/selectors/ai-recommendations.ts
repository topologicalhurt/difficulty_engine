import type { AiRecommendationProviderKey, AppState } from '../../core/types';
import {
  aiModelOptions,
  aiProviderOptions,
  rankedAiModelMatches,
  resolveAiModelInput,
} from '../../core/ai-provider-registry';
import { pendingAiClarificationQuestions } from '../../core/ai-clarifications';

export interface AiProviderOption {
  value: AiRecommendationProviderKey;
  label: string;
}

export interface AiRecommendationViewModel {
  prompt: string;
  status: AppState['ui']['aiStatus'];
  connection: AppState['ui']['aiConnection'];
  settings: AppState['project']['aiRecommendationSettings'];
  proposal: AppState['ui']['aiProposal'];
  clarificationStatus: AppState['ui']['aiClarificationStatus'];
  clarificationMessages: AppState['ui']['aiClarificationMessages'];
  clarificationQuestions: Array<{
    messageIndex: number;
    text: string;
    answer: string;
  }>;
  relationshipStatus: AppState['ui']['aiRelationshipStatus'];
  relationshipWizard: AppState['ui']['aiRelationshipWizard'];
  relationshipProposal: AppState['ui']['aiRelationshipProposal'];
  maxSuggestions: number;
  providerOptions: AiProviderOption[];
  modelSuggestions: Array<{
    provider: AiRecommendationProviderKey;
    model: string;
    label: string;
  }>;
  requestDisabled: boolean;
  clarifyDisabled: boolean;
  workspaceRequestDisabled: boolean;
  workspaceRequestLabel: string;
  relationshipRequestDisabled: boolean;
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
  const pendingQuestions = pendingAiClarificationQuestions(
    state.ui.aiClarificationMessages,
  );
  const anyAiLoading =
    state.ui.aiStatus.state === 'loading' ||
    state.ui.aiRelationshipStatus.state === 'loading' ||
    state.ui.aiClarificationStatus.state === 'loading';
  const workMode = state.project.aiRecommendationSettings.workMode;
  const hasProviderAccess =
    Boolean(state.ui.aiPrompt.trim()) &&
    state.ui.aiConnection.enabled &&
    Boolean(state.ui.aiConnection.apiKey.trim());
  const workspaceRequestLabel = anyAiLoading
    ? 'Working...'
    : pendingQuestions.length
      ? 'Submit answers and generate'
      : workMode === 'new_books'
        ? 'Generate book proposal'
        : workMode === 'plan'
          ? 'Generate plan proposal'
          : 'Generate book + plan proposals';
  return {
    prompt: state.ui.aiPrompt,
    status: state.ui.aiStatus,
    connection: state.ui.aiConnection,
    settings: state.project.aiRecommendationSettings,
    proposal: state.ui.aiProposal,
    clarificationStatus: state.ui.aiClarificationStatus,
    clarificationMessages: state.ui.aiClarificationMessages,
    clarificationQuestions: pendingQuestions.map((question) => ({
      ...question,
      answer:
        state.ui.aiClarificationAnswers[String(question.messageIndex)] ?? '',
    })),
    relationshipStatus: state.ui.aiRelationshipStatus,
    relationshipWizard: state.ui.aiRelationshipWizard,
    relationshipProposal: state.ui.aiRelationshipProposal,
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
      !state.ui.aiConnection.apiKey.trim() ||
      state.project.aiRecommendationSettings.workMode === 'plan',
    clarifyDisabled:
      state.ui.aiClarificationStatus.state === 'loading' ||
      !state.ui.aiPrompt.trim() ||
      !state.ui.aiConnection.enabled ||
      !state.ui.aiConnection.apiKey.trim(),
    workspaceRequestDisabled: anyAiLoading || !hasProviderAccess,
    workspaceRequestLabel,
    relationshipRequestDisabled:
      state.ui.aiRelationshipStatus.state === 'loading' ||
      !state.ui.aiConnection.enabled ||
      !state.ui.aiConnection.apiKey.trim() ||
      state.project.aiRecommendationSettings.workMode === 'new_books',
    applyDisabled:
      !state.ui.aiProposal ||
      (!state.ui.aiProposal.books.length &&
        !state.ui.aiProposal.removeBookIds.length &&
        !state.ui.aiProposal.bookOrder.length),
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
