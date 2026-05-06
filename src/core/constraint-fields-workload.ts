import type { ConstraintField } from './types';

export const DAILY_WORKLOAD_PACING_FIELDS: ConstraintField[] = [
  {
    key: 'minPg',
    group: 'Daily Workload',
    label: 'Minimum pages/day',
    description: 'Hard floor in strict mode; recommendation in relaxed mode.',
    effect: 'schedule_policy',
    kind: 'number',
    min: 1,
    max: 60,
    step: 1,
  },
  {
    key: 'maxPg',
    group: 'Daily Workload',
    label: 'Maximum pages/day',
    description: 'Ceiling for one book on one day.',
    effect: 'schedule_policy',
    kind: 'number',
    min: 1,
    max: 120,
    step: 1,
  },
  {
    key: 'relativePacingStrength',
    group: 'Daily Workload',
    label: 'Relative pacing',
    description:
      'How strongly this library is stretched across the page/day range.',
    effect: 'schedule_policy',
    kind: 'number',
    min: 0,
    max: 100,
    step: 5,
  },
  {
    key: 'relativePacingCurve',
    group: 'Daily Workload',
    label: 'Pacing curve',
    description:
      'Compression curve used when spreading page targets across similar books.',
    effect: 'schedule_policy',
    kind: 'select',
    options: [
      { value: 'smoothstep', label: 'Smooth S-curve' },
      { value: 'linear', label: 'Linear' },
      { value: 'sqrt', label: 'Square-root' },
      { value: 'power', label: 'Power' },
    ],
  },
];

export const DAILY_WORKLOAD_TIME_FIELDS: ConstraintField[] = [
  {
    key: 'bmp',
    group: 'Daily Workload',
    label: 'Base minutes/page',
    description: 'Baseline pace before difficulty adjustments.',
    effect: 'workload_time',
    kind: 'number',
    min: 1,
    max: 90,
    step: 1,
  },
  {
    key: 'gam',
    group: 'Daily Workload',
    label: 'Difficulty time scaling',
    description: 'How strongly schedule difficulty changes minutes per page.',
    effect: 'workload_time',
    kind: 'number',
    min: 0.2,
    max: 5,
    step: 0.05,
  },
  {
    key: 'pt',
    group: 'Daily Workload',
    label: 'Page tolerance',
    description: 'How much the solver may vary around the daily target.',
    effect: 'schedule_policy',
    kind: 'number',
    min: 0,
    max: 1,
    step: 0.05,
  },
];
