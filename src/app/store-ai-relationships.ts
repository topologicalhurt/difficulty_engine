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
import {
  aiRequestContextChanged,
  captureAiRequestContext,
} from './store-ai-request-context';
import type { StoreCommandContext } from './store-command-context';
import { createStoreRequestSequencer } from './store-request-sequencer';

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
  const requests = createStoreRequestSequencer();

  return {
    updateAiRelationshipWizard(patch): void {
      const state = context.getState();
      const requestWasLoading = state.ui.aiRelationshipStatus.state === 'loading';
      if (requestWasLoading) requests.invalidate();
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
      const requestSequence = requests.begin();
      const { context: relationshipContext, snapshot: requestSnapshot } =
        captureAiRequestContext(state, {
          includePrompt: true,
          includeClarifications: true,
        });
      const wizard = state.ui.aiRelationshipWizard;
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
        if (!requests.isCurrent(requestSequence)) return;
        const currentState = context.getState();
        if (aiRequestContextChanged(currentState, requestSnapshot)) {
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
          contextDigest: requestSnapshot.digest,
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
        if (!requests.isCurrent(requestSequence)) return;
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
      requests.invalidate();
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
