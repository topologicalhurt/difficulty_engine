import { createDefaultConstraints } from './default-project';
import { horizonMonthsFromEndDate } from './planning-window';
import { readingScopeSettingsForProject } from './reading-scope';
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
  if (wizard.settingsPolicy === 'respect_current') {
    return [
      {
        id: 'autopilot-current-settings',
        label: 'Current Settings',
        summary:
          'Current planner settings preserved except the explicit wizard inputs.',
        patch: shared,
      },
    ];
  }
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
  return Array.from(new Set(goals)).map((goal) => ({
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
        ? { schedAlgo: 'critical', bookOrderPolicy: 'enforce' as const }
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
    readingScopeSettings: {
      ...readingScopeSettingsForProject(project),
      defaultMode: 'skip_non_core',
    },
  };
}
