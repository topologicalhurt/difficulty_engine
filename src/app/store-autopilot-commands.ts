import { createAutopilotProposal } from '../core/autopilot';
import { readingScopeSettingsForProject } from '../core/reading-scope';
import type {
  CreatePlannerStoreOptions,
  PlannerProjectV1,
  PlannerStoreCommands,
} from '../core/types';
import type { StoreCommandContext } from './store-command-context';

export function createAutopilotCommands(
  context: StoreCommandContext,
  options: Pick<CreatePlannerStoreOptions, 'clock'>,
): Pick<
  PlannerStoreCommands,
  'solveProjectForMe' | 'applyAutopilotProposal' | 'clearAutopilotProposal'
> {
  return {
    solveProjectForMe(): void {
      const state = context.getState();
      const proposal = createAutopilotProposal(
        state.project,
        options.clock.now().toISOString(),
      );
      context.commitUi('autopilot.propose', {
        autopilotProposal: proposal,
        banner: {
          tone: 'info',
          message: 'Autopilot proposal is ready for review.',
        },
      });
    },
    applyAutopilotProposal(): void {
      const state = context.getState();
      const proposal = state.ui.autopilotProposal;
      if (!proposal) return;
      const nextProject: PlannerProjectV1 = {
        ...state.project,
        constraints: {
          ...state.project.constraints,
          ...proposal.constraintPatch,
        },
        readingScopeSettings: {
          ...readingScopeSettingsForProject(state.project),
          ...proposal.readingScopeSettingsPatch,
        },
      };
      context.commitProject(
        'autopilot.apply',
        nextProject,
        {
          autopilotProposal: null,
          banner: {
            tone: 'success',
            message: 'Applied confidence-first autopilot settings.',
          },
        },
      );
    },
    clearAutopilotProposal(): void {
      context.commitUi('autopilot.clear', {
        autopilotProposal: null,
      });
    },
  };
}
