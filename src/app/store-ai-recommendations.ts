import {
  aiModelBelongsToProvider,
  defaultAiModel,
  resolveAiModelInput,
} from '../core/ai-provider-registry';
import {
  normalizeAiRecommendationProposal,
  normalizeAiPromptDraft,
  sanitizeAiPrompt,
} from '../core/ai-recommendations';
import { normalizeAiConnectionSettings } from '../core/project-normalize-ai';
import type {
  CreatePlannerStoreOptions,
  PlannerStoreCommands,
} from '../core/types';
import { isoTimestamp } from '../infra/cache-time';
import {
  buildAiRecommendationContext,
  contextDigest,
} from './ai-recommendation-context';
import { applyAiProposalToProject } from './store-ai-apply';
import type { StoreCommandContext } from './store-command-context';

export function createAiRecommendationCommands(
  context: StoreCommandContext,
  services: CreatePlannerStoreOptions,
): Pick<
  PlannerStoreCommands,
  | 'updateAiLocalSettings'
  | 'setAiRecommendationPrompt'
  | 'requestAiRecommendations'
  | 'clearAiRecommendation'
  | 'applyAiRecommendation'
> {
  let activeRequestSequence = 0;

  function isActiveRequest(sequence: number): boolean {
    return sequence === activeRequestSequence;
  }

  return {
    updateAiLocalSettings(patch): void {
      const state = context.getState();
      const requestWasLoading = state.ui.aiStatus.state === 'loading';
      if (requestWasLoading) activeRequestSequence += 1;
      const patchedConnection = {
        ...state.ui.aiConnection,
        ...patch,
      };
      if (patch.provider && patch.model == null) {
        patchedConnection.model = defaultAiModel(patch.provider);
      }
      if (typeof patch.model === 'string') {
        const resolution = resolveAiModelInput(
          patch.model,
          patchedConnection.provider,
        );
        if (resolution.confidence !== 'none') {
          patchedConnection.provider = resolution.provider;
          patchedConnection.model = resolution.model;
        }
      }
      if (
        patch.provider &&
        patch.model == null &&
        !aiModelBelongsToProvider(patch.provider, patchedConnection.model)
      ) {
        patchedConnection.model = defaultAiModel(patch.provider);
      }
      const nextConnection = normalizeAiConnectionSettings(patchedConnection);
      services.localSettings?.saveAiConnection(nextConnection);
      context.commitUi('ai.localSettings', {
        aiConnection: nextConnection,
        aiStatus: requestWasLoading
          ? {
              state: 'idle',
              message:
                'AI provider settings changed. Request recommendations again.',
            }
          : {
              ...state.ui.aiStatus,
              message: 'AI provider settings updated.',
            },
      });
    },
    setAiRecommendationPrompt(prompt: string): void {
      const state = context.getState();
      const requestWasLoading = state.ui.aiStatus.state === 'loading';
      if (requestWasLoading) activeRequestSequence += 1;
      context.commitUi('ai.prompt', {
        aiPrompt: normalizeAiPromptDraft(prompt),
        aiProposal: requestWasLoading ? null : state.ui.aiProposal,
        aiStatus: requestWasLoading
          ? {
              state: 'idle',
              message: 'Prompt changed. Request recommendations again.',
            }
          : state.ui.aiStatus,
      });
    },
    async requestAiRecommendations(): Promise<void> {
      const state = context.getState();
      const prompt = sanitizeAiPrompt(state.ui.aiPrompt);
      if (!prompt) {
        context.commitUi('ai.request', {
          aiStatus: {
            state: 'failed',
            message: 'Enter a recommendation prompt first.',
          },
        });
        return;
      }
      if (!services.aiRecommendationProvider) {
        context.commitUi('ai.request', {
          aiStatus: {
            state: 'failed',
            message:
              'AI recommendations are not available because this host did not provide an AI recommendation provider.',
          },
        });
        return;
      }
      if (!state.ui.aiConnection.enabled) {
        context.commitUi('ai.request', {
          aiStatus: {
            state: 'failed',
            message:
              'Enable the AI provider before requesting recommendations.',
          },
        });
        return;
      }
      if (!state.ui.aiConnection.apiKey.trim()) {
        context.commitUi('ai.request', {
          aiStatus: {
            state: 'failed',
            message:
              'Add a local AI API key before requesting recommendations.',
          },
        });
        return;
      }
      const requestSequence = (activeRequestSequence += 1);
      const recommendationContext = buildAiRecommendationContext(state);
      const requestContextDigest = contextDigest(recommendationContext);
      context.commitUi('ai.request', {
        aiStatus: {
          state: 'loading',
          message: 'Requesting a batched DAG-aware recommendation...',
        },
        aiProposal: null,
      });
      try {
        const response = await services.aiRecommendationProvider.recommend({
          prompt,
          provider: state.ui.aiConnection.provider,
          model: state.ui.aiConnection.model,
          connection: state.ui.aiConnection,
          maxSuggestions: state.project.aiRecommendationSettings.maxSuggestions,
          context: recommendationContext,
        });
        if (!isActiveRequest(requestSequence)) return;
        const currentContextDigest = contextDigest(
          buildAiRecommendationContext(context.getState()),
        );
        if (currentContextDigest !== requestContextDigest) {
          context.commitUi('ai.request', {
            aiProposal: null,
            aiStatus: {
              state: 'idle',
              message:
                'Planner context changed. Request recommendations again.',
            },
          });
          return;
        }
        const createdAt = isoTimestamp(() => services.clock.now().getTime());
        const proposal = normalizeAiRecommendationProposal(response, {
          provider: state.ui.aiConnection.provider,
          model: state.ui.aiConnection.model,
          prompt,
          createdAt,
          contextDigest: requestContextDigest,
          maxSuggestions: state.project.aiRecommendationSettings.maxSuggestions,
        });
        context.commitUi('ai.request', {
          aiProposal: proposal,
          aiStatus: proposal.books.length
            ? {
                state: 'ready',
                message: `${proposal.books.length} recommendation(s) ready for review.`,
              }
            : {
                state: 'failed',
                message: 'The provider returned no usable book proposals.',
              },
        });
      } catch (error) {
        if (!isActiveRequest(requestSequence)) return;
        context.commitUi('ai.request', {
          aiStatus: {
            state: 'failed',
            message:
              error instanceof Error
                ? error.message
                : 'AI recommendation request failed.',
          },
        });
      }
    },
    clearAiRecommendation(): void {
      activeRequestSequence += 1;
      context.commitUi('ai.clear', {
        aiProposal: null,
        aiStatus: {
          state: 'idle',
          message:
            'Enter a goal, then ask the recommender for a proposed addition.',
        },
      });
    },
    applyAiRecommendation(): void {
      const state = context.getState();
      const proposal = state.ui.aiProposal;
      if (!proposal || !proposal.books.length) {
        return;
      }
      if (
        proposal.contextDigest !==
        contextDigest(buildAiRecommendationContext(state))
      ) {
        context.commitUi('ai.apply', {
          aiProposal: null,
          aiStatus: {
            state: 'idle',
            message: 'Planner context changed. Request recommendations again.',
          },
        });
        return;
      }
      const result = applyAiProposalToProject(state.project, proposal);
      const addedCount = result.addedIds.length;
      context.commitProject('ai.apply', result.project, {
        aiProposal: null,
        selectedBookId: addedCount
          ? (result.addedIds[0] ?? state.ui.selectedBookId)
          : state.ui.selectedBookId,
        activeView: 'library',
        banner: {
          tone: addedCount ? 'success' : 'info',
          message: addedCount
            ? `Applied ${addedCount} AI recommendation(s).`
            : `No new books added; ${result.skippedTitles.length} recommendation(s) already matched the library.`,
        },
      });
    },
  };
}
