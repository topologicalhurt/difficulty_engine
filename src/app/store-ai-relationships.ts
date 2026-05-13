import {
  normalizeAiRelationshipProposal,
  normalizeAiRelationshipWizard,
} from '../core/ai-relationships';
import type {
  CreatePlannerStoreOptions,
  PlannerStoreCommands,
} from '../core/types';
import { isoTimestamp } from '../infra/cache-time';
import {
  buildAiRecommendationContext,
  contextDigest,
} from './ai-recommendation-context';
import { applyAiRelationshipProposalToProject } from './store-ai-relationship-apply';
import type { StoreCommandContext } from './store-command-context';

export function createAiRelationshipCommands(
  context: StoreCommandContext,
  services: CreatePlannerStoreOptions,
): Pick<
  PlannerStoreCommands,
  | 'updateAiRelationshipWizard'
  | 'requestAiRelationshipReorganization'
  | 'clearAiRelationshipProposal'
  | 'applyAiRelationshipProposal'
> {
  let activeRequestSequence = 0;

  function isActiveRequest(sequence: number): boolean {
    return sequence === activeRequestSequence;
  }

  return {
    updateAiRelationshipWizard(patch): void {
      const state = context.getState();
      const requestWasLoading = state.ui.aiRelationshipStatus.state === 'loading';
      if (requestWasLoading) activeRequestSequence += 1;
      context.commitUi('ai.relationshipWizard', {
        aiRelationshipWizard: normalizeAiRelationshipWizard(
          patch,
          state.ui.aiRelationshipWizard,
        ),
        aiRelationshipProposal: requestWasLoading
          ? null
          : state.ui.aiRelationshipProposal,
        aiRelationshipStatus: requestWasLoading
          ? {
              state: 'idle',
              message:
                'Relationship wizard changed. Request a new progression proposal.',
            }
          : state.ui.aiRelationshipStatus,
      });
    },
    async requestAiRelationshipReorganization(): Promise<void> {
      const state = context.getState();
      const provider = services.aiRecommendationProvider;
      if (!provider?.reorganizeRelationships) {
        context.commitUi('ai.relationshipRequest', {
          aiRelationshipStatus: {
            state: 'failed',
            message:
              'AI relationship reorganization is not available because this host did not provide a relationship-capable AI provider.',
          },
        });
        return;
      }
      if (!state.ui.aiConnection.enabled) {
        context.commitUi('ai.relationshipRequest', {
          aiRelationshipStatus: {
            state: 'failed',
            message:
              'Enable the AI provider before requesting a relationship proposal.',
          },
        });
        return;
      }
      if (!state.ui.aiConnection.apiKey.trim()) {
        context.commitUi('ai.relationshipRequest', {
          aiRelationshipStatus: {
            state: 'failed',
            message:
              'Add a local AI API key before requesting a relationship proposal.',
          },
        });
        return;
      }
      if (state.project.aiRecommendationSettings.workMode === 'new_books') {
        context.commitUi('ai.relationshipRequest', {
          aiRelationshipStatus: {
            state: 'failed',
            message:
              'AI work mode is set to new books only. Switch to plan or both to request a relationship proposal.',
          },
        });
        return;
      }
      const requestSequence = (activeRequestSequence += 1);
      const relationshipContext = buildAiRecommendationContext(state);
      const requestContextDigest = contextDigest(relationshipContext);
      const wizard = state.ui.aiRelationshipWizard;
      const requestProvider = state.ui.aiConnection.provider;
      const requestModel = state.ui.aiConnection.model;
      const requestSettingsRevision = state.ui.aiSettingsRevision;
      const requestPrompt = state.ui.aiPrompt;
      const requestClarifications = JSON.stringify(
        state.ui.aiClarificationMessages,
      );
      context.commitUi('ai.relationshipRequest', {
        aiRelationshipStatus: {
          state: 'loading',
          message: 'Requesting a customized relationship progression...',
        },
        aiRelationshipProposal: null,
      });
      try {
        const response = await provider.reorganizeRelationships({
          provider: state.ui.aiConnection.provider,
          model: state.ui.aiConnection.model,
          connection: state.ui.aiConnection,
          context: relationshipContext,
          wizard,
          settings: state.project.aiRecommendationSettings,
          clarifications: state.ui.aiClarificationMessages,
          prompt: state.ui.aiPrompt,
        });
        if (!isActiveRequest(requestSequence)) return;
        const currentContextDigest = contextDigest(
          buildAiRecommendationContext(context.getState()),
        );
        const currentState = context.getState();
        if (
          currentContextDigest !== requestContextDigest ||
          currentState.ui.aiSettingsRevision !== requestSettingsRevision ||
          currentState.ui.aiConnection.provider !== requestProvider ||
          currentState.ui.aiConnection.model !== requestModel ||
          currentState.ui.aiPrompt !== requestPrompt ||
          JSON.stringify(currentState.ui.aiClarificationMessages) !==
            requestClarifications
        ) {
          context.commitUi('ai.relationshipRequest', {
            aiRelationshipProposal: null,
            aiRelationshipStatus: {
              state: 'idle',
              message:
                'Planner context changed. Request a new relationship proposal.',
            },
          });
          return;
        }
        const createdAt = isoTimestamp(() => services.clock.now().getTime());
        const proposal = normalizeAiRelationshipProposal(response, {
          provider: state.ui.aiConnection.provider,
          model: state.ui.aiConnection.model,
          createdAt,
          contextDigest: requestContextDigest,
          wizard,
          project: state.project,
        });
        context.commitUi('ai.relationshipRequest', {
          aiRelationshipProposal: proposal,
          aiRelationshipStatus:
            proposal.stages.length || proposal.relations.length
              ? {
                  state: 'ready',
                  message: `${proposal.stages.length} stage(s) and ${proposal.relations.length} relation change(s) ready for review.`,
                }
              : {
                  state: 'failed',
                  message:
                    'The provider returned no usable relationship proposal.',
                },
        });
      } catch (error) {
        if (!isActiveRequest(requestSequence)) return;
        context.commitUi('ai.relationshipRequest', {
          aiRelationshipStatus: {
            state: 'failed',
            message:
              error instanceof Error
                ? error.message
                : 'AI relationship request failed.',
          },
        });
      }
    },
    clearAiRelationshipProposal(): void {
      activeRequestSequence += 1;
      context.commitUi('ai.relationshipClear', {
        aiRelationshipProposal: null,
        aiRelationshipStatus: {
          state: 'idle',
          message:
            'Tune the relationship wizard, then request a progression proposal.',
        },
      });
    },
    applyAiRelationshipProposal(): void {
      const state = context.getState();
      const proposal = state.ui.aiRelationshipProposal;
      if (!proposal) return;
      if (proposal.contextDigest !== contextDigest(buildAiRecommendationContext(state))) {
        context.commitUi('ai.relationshipApply', {
          aiRelationshipProposal: null,
          aiRelationshipStatus: {
            state: 'idle',
            message:
              'Planner context changed. Request a new relationship proposal.',
          },
        });
        return;
      }
      const result = applyAiRelationshipProposalToProject(state.project, proposal);
      context.commitProject('ai.relationshipApply', result.project, {
        aiRelationshipProposal: null,
        activeView: 'plan',
        banner: {
          tone: result.changedBookIds.length ? 'success' : 'info',
          message: result.changedBookIds.length
            ? `Applied relationship progression to ${result.changedBookIds.length} book(s).`
            : 'No relationship changes were needed.',
        },
      });
    },
  };
}
