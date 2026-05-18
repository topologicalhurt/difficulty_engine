import type { ConstraintField } from './types';

export const DAILY_WORKLOAD_PACING_FIELDS: ConstraintField[] = [
  {
    key: 'learnerProfileMode',
    group: 'Pacing Model',
    label: 'Learner profile',
    description:
      'Adaptive defaults for challenge, pacing spread, and feedback learning.',
    effect: 'schedule_policy',
    kind: 'select',
    options: [
      { value: 'balanced_adaptive', label: 'Balanced adaptive' },
      { value: 'confidence_builder', label: 'Confidence builder' },
      { value: 'fast_track', label: 'Fast track' },
      { value: 'deep_mastery', label: 'Deep mastery' },
      { value: 'manual', label: 'Manual tuning' },
    ],
  },
  {
    key: 'targetChallenge',
    group: 'Pacing Model',
    label: 'Target challenge',
    description:
      'How ambitious the desired daily workload should be before hard constraints are applied.',
    effect: 'schedule_policy',
    kind: 'number',
    min: 0,
    max: 100,
    step: 5,
  },
  {
    key: 'learnerAdaptivityStrength',
    group: 'Pacing Model',
    label: 'Learning from actuals',
    description:
      'How strongly logged minutes/pages recalibrate future workload estimates.',
    effect: 'difficulty_model',
    kind: 'number',
    min: 0,
    max: 100,
    step: 5,
  },
  {
    key: 'actualsPropagationMode',
    group: 'Pacing Model',
    label: 'Use actuals across study group',
    description:
      'Controls whether logged pace evidence stays book-local or partially pools after repeated group evidence.',
    detail:
      'A single book never changes every book. Epoch/project pooling only activates after enough books in the group show consistent logged pace evidence.',
    effect: 'difficulty_model',
    kind: 'select',
    options: [
      { value: 'book_only', label: 'One book only' },
      { value: 'epoch_partial_pooling', label: 'Current study epoch' },
      { value: 'project_partial_pooling', label: 'All active books' },
    ],
    optionDetails: {
      book_only:
        'The safest default: one book’s actuals never imply anything about other books.',
      epoch_partial_pooling:
        'Consistent evidence across multiple books in the same study epoch can lightly adjust the rest of that epoch.',
      project_partial_pooling:
        'Consistent evidence across the active project can apply a weaker global prior. This is intentionally conservative.',
    },
  },
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
