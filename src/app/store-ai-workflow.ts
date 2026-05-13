import {
  answeredClarificationMessage,
  normalizeAiClarificationMessages,
  pendingAiClarificationQuestions,
} from '../core/ai-clarifications';
import type { PlannerStoreCommands } from '../core/types';
import type { StoreCommandContext } from './store-command-context';

type AiWorkflowDependencies = Pick<
  PlannerStoreCommands,
  | 'requestAiClarification'
  | 'requestAiRecommendations'
  | 'requestAiRelationshipReorganization'
>;

export function createAiWorkflowCommands(
  context: StoreCommandContext,
  dependencies: AiWorkflowDependencies,
  options: { hasClarificationProvider: boolean },
): Pick<PlannerStoreCommands, 'requestAiWorkspaceProposal'> {
  return {
    async requestAiWorkspaceProposal(): Promise<void> {
      const state = context.getState();
      const questions = pendingAiClarificationQuestions(
        state.ui.aiClarificationMessages,
      );
      if (questions.length) {
        const missing = questions.filter(
          (question) =>
            !state.ui.aiClarificationAnswers[
              String(question.messageIndex)
            ]?.trim(),
        );
        if (missing.length) {
          context.commitUi('ai.workflowRequest', {
            aiClarificationStatus: {
              state: 'failed',
              message: `Answer all ${questions.length} clarification card(s) before generating.`,
            },
          });
          return;
        }
        const answerMessage = answeredClarificationMessage(
          questions,
          state.ui.aiClarificationAnswers,
        );
        context.commitUi('ai.workflowRequest', {
          aiClarificationMessages: normalizeAiClarificationMessages([
            ...state.ui.aiClarificationMessages,
            ...(answerMessage ? [answerMessage] : []),
          ]),
          aiClarificationAnswers: {},
          aiClarificationStatus: {
            state: 'ready',
            message: 'Clarification answers added to the AI context.',
          },
        });
      } else if (
        options.hasClarificationProvider &&
        !state.ui.aiClarificationMessages.length &&
        context.getState().ui.aiClarificationStatus.state !== 'ready'
      ) {
        await dependencies.requestAiClarification();
        if (
          pendingAiClarificationQuestions(
            context.getState().ui.aiClarificationMessages,
          ).length ||
          context.getState().ui.aiClarificationStatus.state === 'failed'
        ) {
          return;
        }
      }

      const mode = context.getState().project.aiRecommendationSettings.workMode;
      if (mode === 'new_books' || mode === 'both') {
        await dependencies.requestAiRecommendations();
      }
      if (mode === 'plan' || mode === 'both') {
        await dependencies.requestAiRelationshipReorganization();
      }
    },
  };
}
