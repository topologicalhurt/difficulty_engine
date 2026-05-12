import { learnerProfile, type LearnerProfile } from './difficulty-profiles';
import type { ConstraintSet, LearnerProfileMode } from './types';
import { clamp, safeNumber } from './utils';

export interface LearnerProfilePolicy {
  profile: LearnerProfile;
  challengeMultiplier: number;
  rampStartFactor: number;
  rampCurve: number;
  hardContentRampDamping: number;
  difficultyLift: number;
}

const MODE_POLICY: Record<
  LearnerProfileMode,
  Pick<
    LearnerProfilePolicy,
    | 'rampStartFactor'
    | 'rampCurve'
    | 'hardContentRampDamping'
    | 'difficultyLift'
  >
> = {
  balanced_adaptive: {
    rampStartFactor: 0.72,
    rampCurve: 1.45,
    hardContentRampDamping: 0.55,
    difficultyLift: 0,
  },
  confidence_builder: {
    rampStartFactor: 0.55,
    rampCurve: 1.7,
    hardContentRampDamping: 0.7,
    difficultyLift: 0.25,
  },
  fast_track: {
    rampStartFactor: 0.9,
    rampCurve: 1.15,
    hardContentRampDamping: 0.35,
    difficultyLift: -0.15,
  },
  deep_mastery: {
    rampStartFactor: 0.62,
    rampCurve: 1.85,
    hardContentRampDamping: 0.8,
    difficultyLift: 0.35,
  },
  manual: {
    rampStartFactor: 0.72,
    rampCurve: 1.45,
    hardContentRampDamping: 0.55,
    difficultyLift: 0,
  },
};

export function profilePolicy(constraints: ConstraintSet): LearnerProfilePolicy {
  const profile = learnerProfile(constraints);
  const base = MODE_POLICY[profile.mode] ?? MODE_POLICY.balanced_adaptive;
  const adaptivity =
    clamp(safeNumber(constraints.learnerAdaptivityStrength, 50), 0, 100) / 100;
  const challengeMultiplier = clamp(
    0.68 + profile.targetChallenge / 135,
    0.72,
    1.38,
  );
  return {
    profile,
    challengeMultiplier,
    ...base,
    rampStartFactor: clamp(
      base.rampStartFactor + (0.72 - base.rampStartFactor) * (1 - adaptivity),
      0.45,
      1,
    ),
    difficultyLift: base.difficultyLift * adaptivity,
  };
}
