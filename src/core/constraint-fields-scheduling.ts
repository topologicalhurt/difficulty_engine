import type { ConstraintField } from './types';

export const SCHEDULING_STRATEGY_CORE_FIELDS: ConstraintField[] = [
  {
    key: 'schedAlgo',
    group: 'Scheduling Strategy',
    label: 'Scheduling algorithm',
    description: 'Primary ordering strategy for the scheduler.',
    effect: 'schedule_policy',
    kind: 'select',
    options: [
      { value: 'balanced', label: 'Balanced' },
      { value: 'critical', label: 'Critical path' },
      { value: 'greedy', label: 'Greedy' },
      { value: 'fastest', label: 'Fastest finish' },
    ],
  },
  {
    key: 'boostUnused',
    group: 'Scheduling Strategy',
    label: 'Boost unused time',
    description: 'Reuse leftover minutes on active books.',
    effect: 'schedule_policy',
    kind: 'boolean',
  },
  {
    key: 'boostStrength',
    group: 'Scheduling Strategy',
    label: 'Boost strength',
    description: 'How aggressively unused budget is reused.',
    effect: 'schedule_policy',
    kind: 'number',
    min: 0,
    max: 1.5,
    step: 0.05,
  },
  {
    key: 'applyOverlapSkim',
    group: 'Scheduling Strategy',
    label: 'Use overlap skim',
    description: 'Allow overlap to reduce repeated reading.',
    effect: 'schedule_policy',
    kind: 'boolean',
  },
  {
    key: 'skimRatio',
    group: 'Scheduling Strategy',
    label: 'Skim ratio',
    description: 'Portion of overlap that can be treated as skim work.',
    effect: 'schedule_policy',
    kind: 'number',
    min: 0,
    max: 1,
    step: 0.05,
  },
];

export const SCHEDULING_STRATEGY_BACKGROUND_FIELDS: ConstraintField[] = [
  {
    key: 'autoRD',
    group: 'Scheduling Strategy',
    label: 'Auto research/defer',
    description: 'Push long inferred chains into background automatically.',
    effect: 'schedule_policy',
    kind: 'boolean',
  },
  {
    key: 'rdMinChain',
    group: 'Scheduling Strategy',
    label: 'Auto background chain length',
    description: 'Minimum chain length for background inference.',
    effect: 'schedule_policy',
    kind: 'number',
    min: 2,
    max: 12,
    step: 1,
  },
  {
    key: 'rdMinSlope',
    group: 'Scheduling Strategy',
    label: 'Auto background slope',
    description: 'Minimum slope for background inference.',
    effect: 'schedule_policy',
    kind: 'number',
    min: 0,
    max: 2,
    step: 0.05,
  },
];

export const SCHEDULING_STRATEGY_EXCLUSION_FIELDS: ConstraintField[] = [
  {
    key: 'excComp',
    group: 'Scheduling Strategy',
    label: 'Exclude completed books',
    description: 'Remove completed books from active scheduling.',
    effect: 'schedule_policy',
    kind: 'boolean',
  },
];
