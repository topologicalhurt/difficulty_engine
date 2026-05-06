import type { ConstraintField } from './types';

export const PRACTICAL_FEASIBILITY_CORE_FIELDS: ConstraintField[] = [
  {
    key: 'feasibilityMode',
    group: 'Practical Feasibility',
    label: 'Page-floor behavior',
    description: 'Whether minimum pages/day is hard or a recommendation.',
    effect: 'schedule_policy',
    kind: 'select',
    options: [
      { value: 'strict_floor', label: 'Strict page floor' },
      { value: 'practical', label: 'Relaxed page recommendation' },
    ],
  },
  {
    key: 'backfillMode',
    group: 'Practical Feasibility',
    label: 'Backfill policy',
    description: 'How the solver fills empty slots when branches block.',
    effect: 'schedule_policy',
    kind: 'select',
    options: [
      { value: 'global', label: 'Global' },
      { value: 'lane_preserving', label: 'Preserve lanes' },
      { value: 'branch_local', label: 'Same branch' },
    ],
  },
  {
    key: 'prereqMode',
    group: 'Practical Feasibility',
    label: 'Prerequisite policy',
    description:
      'How much overlap is allowed when prerequisites are almost resolved.',
    effect: 'schedule_policy',
    kind: 'select',
    options: [
      { value: 'strict', label: 'Strict' },
      { value: 'smart_overlap', label: 'Smart overlap' },
      { value: 'soft', label: 'Soft' },
    ],
  },
];

export const PRACTICAL_FEASIBILITY_COSTUDY_FIELDS: ConstraintField[] = [
  {
    key: 'mutualEnabled',
    group: 'Practical Feasibility',
    label: 'Enable co-study',
    description: 'Allow co-study links to shape parallel planning.',
    effect: 'schedule_policy',
    kind: 'boolean',
  },
  {
    key: 'mutualOversize',
    group: 'Practical Feasibility',
    label: 'Co-study oversize handling',
    description: 'How large mutual groups should be treated.',
    effect: 'schedule_policy',
    kind: 'select',
    options: [
      { value: 'batch', label: 'Batch' },
      { value: 'strict', label: 'Strict' },
    ],
  },
];
