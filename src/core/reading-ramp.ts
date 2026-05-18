import { profilePolicy } from './profile-policy';
import type { PlanningState } from './internal-types';
import type { PlannerProjectV1 } from './types';
import { clamp, round2 } from './utils';

export interface ReadingRampState {
  factor: number;
  stage: 'early' | 'building' | 'steady';
  reason: string;
}

// Early sessions are eased by a practice-curve style ramp and then converge to
// the base target. The hard-content threshold dampens this effect so high-load
// material is not treated as quickly becoming easy. See spacing/practice
// synthesis: https://laplab.ucsd.edu/articles/Cepeda_etal_2006.pdf
export function readingRampForState(
  state: PlanningState,
  project: PlannerProjectV1,
): ReadingRampState {
  if (state.manualDaysLocked || state.planDays <= 1) {
    return {
      factor: 1,
      stage: 'steady',
      reason: 'Manual/single-day work bypasses nonlinear ramping.',
    };
  }
  const policy = profilePolicy(project.constraints);
  const progress = clamp(
    state.usedDays / Math.max(1, (state.planDays || state.plannedDays || 1) - 1),
    0,
    1,
  );
  const hardContent = clamp((state.eff - 6.5) / 3, 0, 1);
  const startFactor = clamp(
    policy.rampStartFactor +
      (1 - policy.rampStartFactor) *
        hardContent *
        policy.hardContentRampDamping,
    0.45,
    1,
  );
  const curved = Math.pow(progress, policy.rampCurve);
  const factor = round2(clamp(startFactor + (1 - startFactor) * curved, 0.45, 1));
  return {
    factor,
    stage: progress < 0.34 ? 'early' : progress < 0.78 ? 'building' : 'steady',
    reason:
      hardContent > 0.25
        ? 'Hard-content threshold dampens the early-session page reduction.'
        : 'Early sessions start lighter and ramp toward the base target.',
  };
}
