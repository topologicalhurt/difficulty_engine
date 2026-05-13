import { aiModelBelongsToProvider, defaultAiModel } from '../core/ai-provider-registry';
import {
  normalizeAiClarificationAnswer,
  normalizeAiClarificationMessages,
  normalizeAiClarificationResponse,
} from '../core/ai-clarifications';
import {
  normalizeAiRecommendationProposal,
  normalizeAiPromptDraft,
  sanitizeAiPrompt,
} from '../core/ai-recommendations';
import {
  normalizeAiConnectionSettings,
  normalizeAiRecommendationSettings,
} from '../core/project-normalize-ai';
import type {
  CreatePlannerStoreOptions,
  PlannerStoreCommands,
} from '../core/types';
import { isoTimestamp } from '../infra/cache-time';
import {
  buildAiRecommendationContext,
  contextDigest,
} from './ai-recommendation-context';
import { applyAiProposalToProject, hasApplicableAiProposal } from './store-ai-apply';
import type { StoreCommandContext } from './store-command-context';
import {
  aiRequestContextChanged,
  captureAiRequestContext,
} from './store-ai-request-context';
import { createStoreRequestSequencer } from './store-request-sequencer';

export function createAiRecommendationCommands(
  context: StoreCommandContext,
  services: CreatePlannerStoreOptions,
): Pick<
  PlannerStoreCommands,
  | 'updateAiLocalSettings'
  | 'updateAiRecommendationSettings'
  | 'setAiRecommendationPrompt'
  | 'setAiClarificationAnswer'
  | 'requestAiClarification'
  | 'clearAiClarification'
  | 'requestAiRecommendations'
  | 'clearAiRecommendation'
  | 'applyAiRecommendation'
> {
  const requests = createStoreRequestSequencer();

  return {
    updateAiLocalSettings(patch): void {
      const state = context.getState();
      const requestWasLoading = state.ui.aiStatus.state === 'loading';
      const clarificationWasLoading =
        state.ui.aiClarificationStatus.state === 'loading';
      if (requestWasLoading || clarificationWasLoading) {
        requests.invalidate();
      }
      const patchedConnection = {
        ...state.ui.aiConnection,
        ...patch,
      };
      if (patch.provider && patch.model == null) {
        patchedConnection.model = defaultAiModel(patch.provider);
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
        aiSettingsRevision: state.ui.aiSettingsRevision + 1,
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
        aiRelationshipProposal: null,
        aiClarificationStatus:
          clarificationWasLoading
            ? {
                state: 'idle',
                message:
                  'AI provider settings changed. Ask clarifying questions again.',
              }
            : state.ui.aiClarificationStatus,
        aiRelationshipStatus:
          state.ui.aiRelationshipStatus.state === 'loading'
            ? {
                state: 'idle',
                message:
                  'AI provider settings changed. Request a relationship proposal again.',
              }
            : state.ui.aiRelationshipStatus,
      });
    },
    updateAiRecommendationSettings(patch): void {
      const state = context.getState();
      requests.invalidate();
      const nextProject = {
        ...state.project,
        aiRecommendationSettings: normalizeAiRecommendationSettings({
          ...state.project.aiRecommendationSettings,
          ...patch,
        }),
      };
      context.commitProject('ai.recommendationSettings', nextProject, {
        aiProposal: null,
        aiStatus: {
          state: 'idle',
          message: 'AI recommendation settings updated.',
        },
        aiClarificationStatus:
          state.ui.aiClarificationStatus.state === 'loading'
            ? {
                state: 'idle',
                message:
                  'AI recommendation settings changed. Ask clarifying questions again.',
              }
            : state.ui.aiClarificationStatus,
        aiClarificationAnswers: {},
        aiRelationshipProposal: null,
        aiRelationshipStatus: {
          ...state.ui.aiRelationshipStatus,
          message: 'AI recommendation settings updated.',
        },
      });
    },
    setAiRecommendationPrompt(prompt: string): void {
      const state = context.getState();
      const requestWasLoading = state.ui.aiStatus.state === 'loading';
      const clarificationWasLoading =
        state.ui.aiClarificationStatus.state === 'loading';
      if (requestWasLoading || clarificationWasLoading) {
        requests.invalidate();
      }
      context.commitUi('ai.prompt', {
        aiPrompt: normalizeAiPromptDraft(prompt),
        aiStatus: requestWasLoading
          ? {
              state: 'idle',
              message: 'Prompt changed. Request recommendations again.',
            }
          : {
              state: 'idle',
              message: 'Prompt changed. Generate again to refresh output.',
            },
        aiProposal: null,
        aiRelationshipProposal: null,
        aiRelationshipStatus: {
          state: 'idle',
          message: 'Prompt changed. Generate again to refresh the plan proposal.',
        },
        aiClarificationMessages: [],
        aiClarificationAnswers: {},
        aiClarificationStatus: clarificationWasLoading
          ? {
              state: 'idle',
              message: 'Prompt changed. Ask clarifying questions again.',
            }
          : {
              state: 'idle',
              message: 'Prompt changed. Generate again to refresh clarification.',
            },
      });
    },
    setAiClarificationAnswer(messageIndex: number, answer: string): void {
      const state = context.getState();
      context.commitUi('ai.clarificationAnswer', {
        aiClarificationAnswers: {
          ...state.ui.aiClarificationAnswers,
          [String(messageIndex)]: normalizeAiClarificationAnswer(answer),
        },
      });
    },
    async requestAiClarification(): Promise<void> {
      const state = context.getState();
      const prompt = sanitizeAiPrompt(state.ui.aiPrompt);
      if (!prompt) {
        context.commitUi('ai.clarificationRequest', {
          aiClarificationStatus: {
            state: 'failed',
            message: 'Enter a recommendation prompt before clarifying.',
          },
        });
        return;
      }
      const provider = services.aiRecommendationProvider;
      if (!provider?.clarifyRecommendation) {
        context.commitUi('ai.clarificationRequest', {
          aiClarificationStatus: {
            state: 'failed',
            message:
              'AI clarification is not available because this host did not provide a clarification-capable AI provider.',
          },
        });
        return;
      }
      if (!state.ui.aiConnection.enabled) {
        context.commitUi('ai.clarificationRequest', {
          aiClarificationStatus: {
            state: 'failed',
            message: 'Enable the AI provider before asking clarifying questions.',
          },
        });
        return;
      }
      if (!state.ui.aiConnection.apiKey.trim()) {
        context.commitUi('ai.clarificationRequest', {
          aiClarificationStatus: {
            state: 'failed',
            message: 'Add a local AI API key before asking clarifying questions.',
          },
        });
        return;
      }
      const messages = normalizeAiClarificationMessages(
        state.ui.aiClarificationMessages,
      );
      const requestSequence = requests.begin();
      const { context: recommendationContext, snapshot: requestSnapshot } =
        captureAiRequestContext(state, { includePrompt: true });
      context.commitUi('ai.clarificationRequest', {
        aiClarificationStatus: {
          state: 'loading',
          message: 'Checking whether the AI needs clarification cards...',
        },
        aiClarificationMessages: messages,
        aiClarificationAnswers: {},
      });
      try {
        const response = await provider.clarifyRecommendation({
          prompt,
          provider: state.ui.aiConnection.provider,
          model: state.ui.aiConnection.model,
          connection: state.ui.aiConnection,
          settings: state.project.aiRecommendationSettings,
          context: recommendationContext,
          messages,
        });
        if (!requests.isCurrent(requestSequence)) return;
        const currentState = context.getState();
        if (aiRequestContextChanged(currentState, requestSnapshot)) {
          context.commitUi('ai.clarificationRequest', {
            aiClarificationStatus: {
              state: 'idle',
              message: 'Planner context changed. Ask clarifying questions again.',
            },
          });
          return;
        }
        const normalized = normalizeAiClarificationResponse(response);
        const nextMessages = normalizeAiClarificationMessages([
          ...messages,
          ...normalized.questions.map((question) => ({
            role: 'assistant' as const,
            text: question,
          })),
        ]);
        context.commitUi('ai.clarificationRequest', {
          aiPrompt: normalized.refinedPrompt ?? currentState.ui.aiPrompt,
          aiClarificationMessages: nextMessages,
          aiClarificationAnswers: {},
          dialog: normalized.questions.length
            ? {
                id: 'ai.clarification',
                title: 'AI rapid-fire questions',
                body: `${normalized.questions.length} clarification card(s) are ready.`,
                detail:
                  'Answer them in the AI tab, then generate the book or plan proposal.',
                tone: 'info',
                actions: [{ id: 'close', label: 'Answer cards' }],
              }
            : currentState.ui.dialog,
          aiClarificationStatus: {
            state: normalized.ready ? 'ready' : 'idle',
            message: normalized.ready
              ? 'Clarification complete. Request recommendations when ready.'
              : normalized.questions.length
                ? 'Answer the rapid-fire clarification cards, then proceed with a proposal.'
                : 'No further clarification question was returned.',
          },
        });
      } catch (error) {
        if (!requests.isCurrent(requestSequence)) return;
        context.commitUi('ai.clarificationRequest', {
          aiClarificationStatus: {
            state: 'failed',
            message:
              error instanceof Error
                ? error.message
                : 'AI clarification request failed.',
          },
        });
      }
    },
    clearAiClarification(): void {
      requests.invalidate();
      context.commitUi('ai.clarificationClear', {
        aiClarificationStatus: {
          state: 'idle',
          message: 'Ask clarifying questions before requesting recommendations.',
        },
        aiClarificationMessages: [],
        aiClarificationAnswers: {},
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
      if (state.project.aiRecommendationSettings.workMode === 'plan') {
        context.commitUi('ai.request', {
          aiStatus: {
            state: 'failed',
            message:
              'AI work mode is set to plan only. Switch to new books or both to request book recommendations.',
          },
        });
        return;
      }
      const requestSequence = requests.begin();
      const { context: recommendationContext, snapshot: requestSnapshot } =
        captureAiRequestContext(state, { includePrompt: true });
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
          settings: state.project.aiRecommendationSettings,
          clarifications: state.ui.aiClarificationMessages,
          context: recommendationContext,
        });
        if (!requests.isCurrent(requestSequence)) return;
        if (aiRequestContextChanged(context.getState(), requestSnapshot)) {
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
          contextDigest: requestSnapshot.digest,
          maxSuggestions: state.project.aiRecommendationSettings.maxSuggestions,
        });
        context.commitUi('ai.request', {
          aiProposal: proposal,
          aiStatus: proposal.books.length || proposal.projectSettings.length
            ? {
                state: 'ready',
                message: `${proposal.books.length} book recommendation(s) and ${proposal.projectSettings.length} project setting suggestion(s) ready for review.`,
              }
            : {
                state: 'failed',
                message: 'The provider returned no usable book proposals.',
              },
        });
      } catch (error) {
        if (!requests.isCurrent(requestSequence)) return;
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
      requests.invalidate();
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
      if (!hasApplicableAiProposal(proposal)) {
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
      const removedCount = result.removedIds.length;
      const selectedBookId = addedCount
        ? (result.addedIds[0] ?? state.ui.selectedBookId)
        : result.removedIds.includes(state.ui.selectedBookId ?? '')
          ? null
          : state.ui.selectedBookId;
      const changed = addedCount || removedCount || result.reordered;
      context.commitProject('ai.apply', result.project, {
        aiProposal: null,
        selectedBookId,
        activeView: 'library',
        banner: {
          tone: changed ? 'success' : 'info',
          message: changed
            ? `Applied AI recommendation proposal: ${addedCount} added, ${removedCount} removed${result.reordered ? ', order updated' : ''}.`
            : `No library changes; ${result.skippedTitles.length} recommendation(s) already matched the library.`,
        },
      });
    },
  };
}
