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
