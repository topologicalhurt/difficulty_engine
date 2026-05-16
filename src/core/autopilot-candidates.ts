import { createDefaultConstraints } from './default-project';
import { horizonMonthsFromEndDate } from './planning-window';
import type {
  AutopilotGoal,
  AutopilotWizardState,
  ConstraintSet,
  PlannerProjectV1,
} from './types';

export interface AutopilotCandidateSpec {
  id: string;
  label: string;
  summary: string;
  patch: Partial<ConstraintSet>;
  relaxationPenalty?: number;
  relaxationReasons?: string[];
}

function goalPatch(goal: AutopilotGoal): Partial<ConstraintSet> {
  switch (goal) {
    case 'deadline_first':
      return {
        learnerProfileMode: 'fast_track',
        learnerAdaptivityStrength: 68,
        targetChallenge: 72,
        relativePacingStrength: 72,
        relativePacingCurve: 'sqrt',
        dailyBookMode: 'interspersed',
        schedAlgo: 'critical',
        prereqMode: 'smart_overlap',
        bookOrderPolicy: 'auto',
      };
    case 'fast_survey':
      return {
        learnerProfileMode: 'fast_track',
        learnerAdaptivityStrength: 58,
        targetChallenge: 62,
        relativePacingStrength: 58,
        relativePacingCurve: 'linear',
        dailyBookMode: 'interspersed',
        schedAlgo: 'fastest',
        prereqMode: 'soft',
        bookOrderPolicy: 'prefer',
      };
    case 'deep_mastery':
      return {
        learnerProfileMode: 'deep_mastery',
        learnerAdaptivityStrength: 82,
        targetChallenge: 44,
        relativePacingStrength: 46,
        relativePacingCurve: 'smoothstep',
        dailyBookMode: 'daily_cohort',
        schedAlgo: 'balanced',
        prereqMode: 'strict',
        bookOrderPolicy: 'enforce',
      };
    case 'custom':
    case 'confidence_first':
    default:
      return {
        learnerProfileMode: 'confidence_builder',
        learnerAdaptivityStrength: 74,
        targetChallenge: 34,
        relativePacingStrength: 34,
        relativePacingCurve: 'smoothstep',
        dailyBookMode: 'daily_cohort',
        schedAlgo: 'balanced',
        prereqMode: 'strict',
        bookOrderPolicy: 'auto',
      };
  }
}

export function buildAutopilotCandidateSpecs(
  project: PlannerProjectV1,
  wizard: AutopilotWizardState,
): AutopilotCandidateSpec[] {
  const horizonMonths = horizonMonthsFromEndDate(
    project.constraints.sd,
    wizard.targetEndDate,
  );
  const shared: Partial<ConstraintSet> = {
    hpd: wizard.dailyHours,
    par: wizard.hardParallelCap,
    tl: horizonMonths,
    feasibilityMode: wizard.floorPolicy,
  };
  const currentSettingsCandidates: AutopilotCandidateSpec[] =
    wizard.settingsPolicy === 'respect_current'
      ? [
          {
            id: 'autopilot-current-settings',
            label: 'Current Settings',
            summary:
              'Current planner settings preserved except the explicit wizard inputs.',
            patch: shared,
          },
        ]
      : [];
  const baselinePatch = {
    ...createDefaultConstraints(),
    sd: project.constraints.sd,
  };
  const goals: AutopilotGoal[] = [
    wizard.goal,
    'confidence_first',
    'deadline_first',
    'deep_mastery',
    'fast_survey',
  ];
  const goalCandidates: AutopilotCandidateSpec[] =
    wizard.settingsPolicy === 'respect_current'
      ? []
      : Array.from(new Set(goals)).map((goal) => ({
          id: `autopilot-${goal}`,
          label: goal
            .split('_')
            .map((part) => part[0]?.toUpperCase() + part.slice(1))
            .join(' '),
          summary: `${goal.replace(/_/g, ' ')} policy optimized against the declared hard constraints and soft objective order.`,
          patch: {
            ...baselinePatch,
            ...goalPatch(goal),
            ...shared,
            ...(wizard.deadlinePolicy === 'strict'
              ? {
                  schedAlgo: 'critical' as const,
                  bookOrderPolicy: 'enforce' as const,
                }
              : {}),
            ...(wizard.confidencePosture === 'aggressive'
              ? {
                  targetChallenge: 76,
                  learnerAdaptivityStrength: 62,
                  relativePacingStrength: 78,
                }
              : {}),
            ...(wizard.confidencePosture === 'conservative'
              ? {
                  targetChallenge: 32,
                  learnerAdaptivityStrength: 78,
                  relativePacingStrength: 32,
                }
              : {}),
          },
        }));
  const baseRecoveryPatch =
    wizard.settingsPolicy === 'respect_current'
      ? shared
      : {
          ...baselinePatch,
          ...goalPatch(wizard.goal),
          ...shared,
        };
  const baseTimeline = Math.max(project.constraints.tl, shared.tl ?? 1);
  const weekdayPatch = {
    studyWeekdays: [0, 1, 2, 3, 4, 5, 6],
    weekdaysCustom: true,
    dpw: 7,
  };
  const recoveryCandidates: AutopilotCandidateSpec[] = [
    {
      id: 'autopilot-recover-practical-floor',
      label: 'Minimal Completion Fix',
      summary:
        'Minimal recovery: keep explicit time/parallel inputs, but use practical page floors and batch impossible co-study groups.',
      patch: {
        ...baseRecoveryPatch,
        feasibilityMode: 'practical',
        mutualOversize: 'batch',
        emptyDayPolicy: 'fill_when_possible',
      },
      relaxationPenalty: 8,
      relaxationReasons: [
        'Use practical page floors so one impossible floor does not block the whole completion date.',
        'Batch oversized co-study groups instead of allowing them to block the plan.',
      ],
    },
    {
      id: 'autopilot-recover-soft-blockers',
      label: 'Unblock Prerequisites',
      summary:
        'Recovery: relax prerequisite/order pressure while preserving explicit hours and parallel cap.',
      patch: {
        ...baseRecoveryPatch,
        feasibilityMode: 'practical',
        prereqMode: 'smart_overlap',
        bookOrderPolicy: 'auto',
        backfillMode: 'global',
        dailyBookMode: 'interspersed',
        schedAlgo: 'critical',
        mutualOversize: 'batch',
        emptyDayPolicy: 'fill_when_possible',
      },
      relaxationPenalty: 18,
      relaxationReasons: [
        'Allow smart prerequisite overlap when strict sequencing prevents any completion date.',
        'Let the scheduler choose book order when enforced order creates a dead end.',
      ],
    },
    {
      id: 'autopilot-recover-extend-window',
      label: 'Extend Planning Window',
      summary:
        'Recovery: keep capacity unchanged but extend the horizon enough to expose a completion date.',
      patch: {
        ...baseRecoveryPatch,
        feasibilityMode: 'practical',
        prereqMode: 'smart_overlap',
        bookOrderPolicy: 'auto',
        backfillMode: 'global',
        dailyBookMode: 'interspersed',
        schedAlgo: 'critical',
        mutualOversize: 'batch',
        emptyDayPolicy: 'fill_when_possible',
        tl: Math.max(baseTimeline, 36),
      },
      relaxationPenalty: 32,
      relaxationReasons: [
        'Extend the planning window before changing daily workload.',
      ],
    },
    {
      id: 'autopilot-recover-capacity',
      label: 'Increase Study Capacity',
      summary:
        'Recovery: add modest daily capacity only if softer scheduling still cannot finish.',
      patch: {
        ...baseRecoveryPatch,
        feasibilityMode: 'practical',
        prereqMode: 'smart_overlap',
        bookOrderPolicy: 'auto',
        backfillMode: 'global',
        dailyBookMode: 'interspersed',
        schedAlgo: 'critical',
        mutualOversize: 'batch',
        emptyDayPolicy: 'fill_when_possible',
        tl: Math.max(baseTimeline, 36),
        hpd: Math.max(shared.hpd ?? project.constraints.hpd, 4),
        par: Math.max(shared.par ?? project.constraints.par, 2),
      },
      relaxationPenalty: 54,
      relaxationReasons: [
        'Increase daily hours and parallel slots only after lower-impact fixes fail.',
      ],
    },
    {
      id: 'autopilot-recover-known-date',
      label: 'Guaranteed Completion Search',
      summary:
        'Recovery: use broad availability and higher study capacity to force a useful completion date when the settings are badly overconstrained.',
      patch: {
        ...baseRecoveryPatch,
        ...weekdayPatch,
        feasibilityMode: 'practical',
        prereqMode: 'soft',
        bookOrderPolicy: 'auto',
        backfillMode: 'global',
        dailyBookMode: 'interspersed',
        schedAlgo: 'fastest',
        learnerProfileMode: 'fast_track',
        learnerAdaptivityStrength: 100,
        targetChallenge: 100,
        relativePacingStrength: 0,
        relativePacingCurve: 'linear',
        mutualOversize: 'batch',
        emptyDayPolicy: 'fill_when_possible',
        tl: Math.max(baseTimeline, 60),
        hpd: Math.max(shared.hpd ?? project.constraints.hpd, 10),
        par: Math.max(shared.par ?? project.constraints.par, 3),
        minPg: Math.min(project.constraints.minPg, 1),
        maxPg: Math.max(project.constraints.maxPg, 80),
      },
      relaxationPenalty: 90,
      relaxationReasons: [
        'Use a broad weekly study schedule and soft prerequisite policy as a last resort.',
        'Lower the page floor and increase study capacity to recover a useful completion date.',
      ],
    },
    {
      id: 'autopilot-recover-fastest-date',
      label: 'Fastest Completion Search',
      summary:
        'Last-resort recovery: maximize reasonable study availability before declaring the project effectively open-ended.',
      patch: {
        ...baseRecoveryPatch,
        ...weekdayPatch,
        feasibilityMode: 'practical',
        prereqMode: 'soft',
        bookOrderPolicy: 'auto',
        backfillMode: 'global',
        dailyBookMode: 'interspersed',
        schedAlgo: 'fastest',
        learnerProfileMode: 'fast_track',
        learnerAdaptivityStrength: 100,
        targetChallenge: 100,
        relativePacingStrength: 0,
        relativePacingCurve: 'linear',
        mutualOversize: 'batch',
        emptyDayPolicy: 'fill_when_possible',
        tl: Math.max(baseTimeline, 60),
        hpd: Math.max(shared.hpd ?? project.constraints.hpd, 16),
        par: Math.max(shared.par ?? project.constraints.par, 4),
        minPg: Math.min(project.constraints.minPg, 1),
        maxPg: Math.max(project.constraints.maxPg, 120),
      },
      relaxationPenalty: 130,
      relaxationReasons: [
        'Use maximum reasonable daily availability only when lower-impact recovery still produces an impractically long plan.',
        'Raise the page cap so the solver can actually use the added study time.',
      ],
    },
  ];
  return [
    ...currentSettingsCandidates,
    ...goalCandidates,
    ...recoveryCandidates,
  ];
}

export function applyAutopilotCandidate(
  project: PlannerProjectV1,
  patch: Partial<ConstraintSet>,
): PlannerProjectV1 {
  return {
    ...project,
    constraints: {
      ...project.constraints,
      ...patch,
    },
  };
}
