import { weekdaysForCount } from '../core/weekdays';
import type { ConstraintSet, PlannerProjectV1, PlannerStoreCommands } from '../core/types';
import type { StoreCommandContext } from './store-command-context';
import { constraintContractId } from './wiring/constraint-contracts';

export function createConstraintCommands(
  context: StoreCommandContext,
): Pick<PlannerStoreCommands, 'updateConstraint' | 'updateConstraints'> {
  function updateConstraints(
    patch: Partial<ConstraintSet>,
    contractId = 'constraint.studyWeekdays',
  ): void {
    const state = context.getState();
    const nextProject: PlannerProjectV1 = {
      ...state.project,
      constraints: {
        ...state.project.constraints,
        ...patch,
      },
    };
    context.commitProject(contractId, nextProject, { banner: null });
  }

  return {
    updateConstraint<K extends keyof ConstraintSet>(key: K, value: ConstraintSet[K]): void {
      if (key === 'dpw') {
        const dpw = Number(value);
        updateConstraints(
          {
            dpw,
            weekdaysCustom: false,
            studyWeekdays: weekdaysForCount(dpw),
          },
          constraintContractId(key),
        );
        return;
      }
      updateConstraints({ [key]: value } as Partial<ConstraintSet>, constraintContractId(key));
    },
    updateConstraints,
  };
}
