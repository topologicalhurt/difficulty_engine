import type { ConstraintSet, LearnerProfileMode } from './types';
import {
  LEARNER_ADAPTIVITY_DEFAULT,
  RELATIVE_PACING_DEFAULT,
  TARGET_CHALLENGE_DEFAULT,
} from './constants';
import { clamp, safeNumber } from './utils';

export interface LearnerProfile {
  mode: LearnerProfileMode;
  targetChallenge: number;
  pacingSpread: number;
  uncertaintyTolerance: number;
  feedbackStrength: number;
  graphConfidence: number;
}

const PROFILE_DEFAULTS: Record<LearnerProfileMode, LearnerProfile> = {
  balanced_adaptive: {
    mode: 'balanced_adaptive',
    targetChallenge: 55,
    pacingSpread: 55,
    uncertaintyTolerance: 0.55,
    feedbackStrength: 0.5,
    graphConfidence: 0.75,
  },
  confidence_builder: {
    mode: 'confidence_builder',
    targetChallenge: 42,
    pacingSpread: 38,
    uncertaintyTolerance: 0.35,
    feedbackStrength: 0.35,
    graphConfidence: 0.65,
  },
  fast_track: {
    mode: 'fast_track',
    targetChallenge: 72,
    pacingSpread: 78,
    uncertaintyTolerance: 0.72,
    feedbackStrength: 0.65,
    graphConfidence: 0.78,
  },
  deep_mastery: {
    mode: 'deep_mastery',
    targetChallenge: 48,
    pacingSpread: 46,
    uncertaintyTolerance: 0.42,
    feedbackStrength: 0.45,
    graphConfidence: 0.9,
  },
  manual: {
    mode: 'manual',
    targetChallenge: 55,
    pacingSpread: 50,
    uncertaintyTolerance: 0.5,
    feedbackStrength: 0.5,
    graphConfidence: 0.75,
  },
};

export function learnerProfile(constraints: ConstraintSet): LearnerProfile {
  const base =
    PROFILE_DEFAULTS[constraints.learnerProfileMode] ||
    PROFILE_DEFAULTS.balanced_adaptive;
  const targetChallenge = clamp(
    base.targetChallenge +
      safeNumber(constraints.targetChallenge, TARGET_CHALLENGE_DEFAULT) -
      TARGET_CHALLENGE_DEFAULT,
    0,
    100,
  );
  const pacingSpread = clamp(
    base.pacingSpread +
      safeNumber(constraints.relativePacingStrength, RELATIVE_PACING_DEFAULT) -
      RELATIVE_PACING_DEFAULT,
    0,
    100,
  );
  const feedbackStrength = clamp(
    base.feedbackStrength *
      (safeNumber(
        constraints.learnerAdaptivityStrength,
        LEARNER_ADAPTIVITY_DEFAULT,
      ) /
        LEARNER_ADAPTIVITY_DEFAULT),
    0,
    1,
  );
  if (base.mode === 'manual') {
    return {
      ...base,
      targetChallenge: clamp(safeNumber(constraints.targetChallenge, 55), 0, 100),
      pacingSpread: clamp(
        safeNumber(constraints.relativePacingStrength, 50),
        0,
        100,
      ),
      feedbackStrength:
        clamp(safeNumber(constraints.learnerAdaptivityStrength, 50), 0, 100) /
        100,
    };
  }
  return {
    ...base,
    targetChallenge,
    pacingSpread,
    feedbackStrength,
  };
}

export function challengeMultiplier(profile: LearnerProfile): number {
  return clamp(0.75 + profile.targetChallenge / 200, 0.75, 1.25);
}
