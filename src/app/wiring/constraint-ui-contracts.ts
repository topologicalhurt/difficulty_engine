import type { WiringContract } from './contract-types';

export const CONSTRAINT_UI_CONTRACTS: WiringContract[] = [
  {
    id: 'ui.constraintAdvancedGroup',
    surface: 'constraints',
    control: 'Show advanced group fields',
    command: 'toggleConstraintAdvancedGroup',
    projectReads: [],
    projectWrites: [],
    uiReads: ['openConstraintGroups'],
    uiWrites: ['openConstraintGroups'],
    snapshotEffects: [],
    renderEffects: ['constraints'],
    recomputePolicy: 'ui_only',
    testIds: [
      'tests/app/constraints-view-model.test.ts',
      'tests/app/wiring-contracts.test.ts',
    ],
    notes:
      'Advanced field disclosure is UI-only and does not affect planner truth.',
  },
  {
    id: 'ui.constraintField',
    surface: 'constraints',
    control: 'Focused constraint explanation',
    command: 'selectConstraintField',
    projectReads: [],
    projectWrites: [],
    uiReads: ['selectedConstraintKey'],
    uiWrites: ['selectedConstraintKey'],
    snapshotEffects: [],
    renderEffects: ['constraint explanation'],
    recomputePolicy: 'ui_only',
    testIds: [
      'tests/app/constraints-view-model.test.ts',
      'tests/app/wiring-contracts.test.ts',
    ],
    notes: 'Focused setting controls explanatory copy only.',
  },
];
