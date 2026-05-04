import { CONSTRAINT_FIELDS } from '../../core/defaults';
import type { ConstraintSet } from '../../core/types';
import type { WiringContract, WiringContractId } from './contract-types';

export const CONSTRAINT_CONTRACTS: WiringContract[] = CONSTRAINT_FIELDS.map((field) => ({
  id: `constraint.${String(field.key)}`,
  surface: field.group === 'Graph Controls' ? 'graphs' : 'constraints',
  control: field.label,
  command: field.key === 'studyWeekdays' ? 'updateConstraints' : 'updateConstraint',
  projectReads: [`constraints.${String(field.key)}`],
  projectWrites:
    field.key === 'dpw'
      ? ['constraints.dpw', 'constraints.weekdaysCustom', 'constraints.studyWeekdays']
      : field.key === 'studyWeekdays'
        ? ['constraints.studyWeekdays', 'constraints.weekdaysCustom', 'constraints.dpw']
        : [`constraints.${String(field.key)}`],
  uiReads: [],
  uiWrites: ['banner'],
  snapshotEffects: ['topics', 'relations', 'difficultyModel', 'schedulePlan', 'dayPlan', 'scheduleStats'],
  renderEffects: ['warnings', 'gantt', 'calendar', 'graphs', 'charts'],
  recomputePolicy: 'snapshot',
  testIds: ['tests/app/parameter-matrix.test.ts'],
  notes: 'Every planner constraint mutates the canonical project and must rebuild the engine snapshot.',
}));

export function constraintContractId(key: keyof ConstraintSet): WiringContractId {
  return `constraint.${String(key)}`;
}
