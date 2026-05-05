import type { ConstraintField } from './types';

export const PLAN_WINDOW_FIELDS: ConstraintField[] = [
  {
    key: 'sd',
    group: 'Plan Window',
    label: 'Start date',
    description: 'Timeline anchor for the study plan.',
    effect: 'schedule_policy',
    kind: 'date',
  },
  {
    key: 'tl',
    group: 'Plan Window',
    label: 'Target end date',
    description:
      'Soft planning horizon used for calendar range and target comparison.',
    effect: 'schedule_policy',
    kind: 'target-date',
  },
  {
    key: 'par',
    group: 'Plan Window',
    label: 'Parallel slots',
    description: 'Target number of active books per study day.',
    effect: 'schedule_policy',
    kind: 'number',
    min: 1,
    max: 6,
    step: 1,
  },
  {
    key: 'dailyBookMode',
    group: 'Plan Window',
    label: 'Daily book cadence',
    description:
      'Whether parallel slots rotate freely or stay as a daily cohort until books finish.',
    effect: 'schedule_policy',
    kind: 'select',
    options: [
      { value: 'interspersed', label: 'Interspersed rotation' },
      { value: 'daily_cohort', label: 'Daily N-book cohort' },
    ],
  },
  {
    key: 'emptyDayPolicy',
    group: 'Plan Window',
    label: 'Empty day behavior',
    description:
      'Whether the planner pulls eligible work forward or preserves planned release gaps.',
    effect: 'schedule_policy',
    kind: 'select',
    options: [
      { value: 'fill_when_possible', label: 'Fill whenever possible' },
      { value: 'preserve_schedule_gaps', label: 'Preserve schedule gaps' },
    ],
  },
  {
    key: 'bookOrderPolicy',
    group: 'Plan Window',
    label: 'Book order policy',
    description:
      'Use the library order as no signal, a preference, or an enforced N-wide sequence.',
    effect: 'schedule_policy',
    kind: 'select',
    options: [
      { value: 'auto', label: 'Automatic' },
      { value: 'prefer', label: 'Prefer library order' },
      { value: 'enforce', label: 'Enforce library order' },
    ],
  },
  {
    key: 'hpd',
    group: 'Plan Window',
    label: 'Hours per day',
    description: 'Hard time budget for a study day.',
    effect: 'workload_time',
    kind: 'number',
    min: 0.5,
    max: 12,
    step: 0.25,
  },
  {
    key: 'dpw',
    group: 'Plan Window',
    label: 'Days per week',
    description: 'Study-day count when custom weekdays are disabled.',
    effect: 'schedule_policy',
    kind: 'number',
    min: 1,
    max: 7,
    step: 1,
  },
  {
    key: 'studyWeekdays',
    group: 'Plan Window',
    label: 'Study weekdays',
    description: 'Custom weekdays for the calendar and solver.',
    effect: 'schedule_policy',
    kind: 'weekday-set',
  },
];

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
