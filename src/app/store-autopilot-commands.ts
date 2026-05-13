import { createAutopilotProposal } from '../core/autopilot';
import type {
  CreatePlannerStoreOptions,
  PlannerProjectV1,
  PlannerStoreCommands,
} from '../core/types';
import type { StoreCommandContext } from './store-command-context';

export function createAutopilotCommands(
  context: StoreCommandContext,
  options: Pick<CreatePlannerStoreOptions, 'clock' | 'engine' | 'computeAdapter'>,
): Pick<
  PlannerStoreCommands,
  | 'updateAutopilotDraft'
  | 'solveProjectForMe'
  | 'applyAutopilotProposal'
  | 'clearAutopilotProposal'
> {
  let autopilotRequestSeq = 0;
  return {
    updateAutopilotDraft(patch): void {
      autopilotRequestSeq += 1;
      const state = context.getState();
      context.commitUi('autopilot.draft', {
        autopilotDraft: {
          ...state.ui.autopilotDraft,
          ...patch,
        },
        autopilotProposal: null,
      });
    },
    async solveProjectForMe(): Promise<void> {
      const requestSeq = ++autopilotRequestSeq;
      const state = context.getState();
      const projectRevision = state.performance.projectRevision;
      const draft = state.ui.autopilotDraft;
      context.commitUi('autopilot.propose', {
        autopilotProposal: null,
        banner: {
          tone: 'info',
          message: 'Optimizing autopilot proposal...',
        },
      });
      try {
        const proposal = await createAutopilotProposal(
          state.project,
          state.snapshot,
          async (project) => {
            if (
              options.computeAdapter &&
              options.computeAdapter.mode === 'worker' &&
              (options.computeAdapter.shouldDefer?.(project) ?? true)
            ) {
              return options.computeAdapter.compute(project);
            }
            await new Promise((resolve) => setTimeout(resolve, 0));
            return options.engine.computeSnapshot(project);
          },
          options.clock.now().toISOString(),
          draft,
        );
        const latest = context.getState();
        if (
          requestSeq !== autopilotRequestSeq ||
          latest.performance.projectRevision !== projectRevision
        ) {
          return;
        }
        context.commitUi('autopilot.propose', {
          autopilotProposal: proposal,
          banner: {
            tone: 'info',
            message: 'Autopilot proposal is ready for review.',
          },
        });
      } catch (error) {
        if (requestSeq !== autopilotRequestSeq) return;
        context.commitUi('autopilot.propose', {
          autopilotProposal: null,
          banner: {
            tone: 'error',
            message:
              error instanceof Error
                ? `Autopilot failed: ${error.message}`
                : 'Autopilot failed.',
          },
        });
      }
    },
    applyAutopilotProposal(): void {
      const state = context.getState();
      const proposal = state.ui.autopilotProposal;
      if (!proposal) {
        context.commitUi('autopilot.propose', {
          banner: {
            tone: 'warn',
            message: 'Generate an autopilot proposal before applying.',
          },
        });
        return;
      }
      const stillInfeasible = proposal.optimization.status === 'infeasible';
      const nextProject: PlannerProjectV1 = {
        ...state.project,
        constraints: {
          ...state.project.constraints,
          ...proposal.constraintPatch,
        },
      };
      context.commitProject(
        'autopilot.apply',
        nextProject,
        {
          autopilotProposal: null,
          banner: {
            tone: stillInfeasible ? 'warn' : 'success',
            message: stillInfeasible
              ? 'Applied best available autopilot settings, but hard constraints still need relaxation.'
              : 'Applied optimized autopilot settings.',
          },
        },
      );
    },
    clearAutopilotProposal(): void {
      autopilotRequestSeq += 1;
      context.commitUi('autopilot.clear', {
        autopilotProposal: null,
      });
    },
  };
}
