import {
  LEARNER_CALIBRATION_LIFT_CAP,
  LEARNER_CALIBRATION_MIN_PAGES,
  LEARNER_CALIBRATION_PAGE_NORMALIZER,
} from './constants';
import { minutesPerPage } from './constraints';
import { learnerProfile } from './difficulty-profiles';
import type { PlannerProjectV1 } from './types';
import { clamp, round2, safeNumber } from './utils';

export interface LearnerCalibrationResult {
  learnerCalibrationLift: number;
  confidence: number;
  observedMinutesPerPage: number | null;
  reason: string;
}

function actualsForBook(project: PlannerProjectV1, bookId: string): {
  minutes: number;
  pages: number;
} {
  return Object.values(project.manualOverrides.actuals).reduce(
    (total, byBook) => {
      const entry = byBook[bookId];
      if (!entry) return total;
      return {
        minutes: total.minutes + Math.max(0, safeNumber(entry.minutes, 0)),
        pages: total.pages + Math.max(0, safeNumber(entry.pages, 0)),
      };
    },
    { minutes: 0, pages: 0 },
  );
}

export function applyLearnerCalibration(input: {
  project: PlannerProjectV1;
  bookId: string;
  baseDifficulty: number;
  lockDiff: boolean;
}): LearnerCalibrationResult {
  const actuals = actualsForBook(input.project, input.bookId);
  const profile = learnerProfile(input.project.constraints);
  if (
    input.lockDiff ||
    profile.feedbackStrength <= 0 ||
    actuals.pages < LEARNER_CALIBRATION_MIN_PAGES ||
    actuals.minutes <= 0
  ) {
    return {
      learnerCalibrationLift: 0,
      confidence: 0,
      observedMinutesPerPage: actuals.pages
        ? round2(actuals.minutes / Math.max(0.1, actuals.pages))
        : null,
      reason:
        actuals.pages < LEARNER_CALIBRATION_MIN_PAGES
          ? 'Not enough logged pages to recalibrate this book yet.'
          : 'Learner calibration is disabled or locked for this book.',
    };
  }
  const observedMpp = actuals.minutes / Math.max(0.1, actuals.pages);
  const expectedMpp = minutesPerPage(input.baseDifficulty, input.project.constraints);
  const evidenceConfidence = clamp(
    actuals.pages / LEARNER_CALIBRATION_PAGE_NORMALIZER,
    0,
    1,
  );
  const ratioLift = Math.log2(Math.max(0.1, observedMpp) / Math.max(0.1, expectedMpp));
  const lift = round2(
    clamp(
      ratioLift * 1.25 * evidenceConfidence * profile.feedbackStrength,
      -LEARNER_CALIBRATION_LIFT_CAP,
      LEARNER_CALIBRATION_LIFT_CAP,
    ),
  );
  return {
    learnerCalibrationLift: lift,
    confidence: round2(evidenceConfidence),
    observedMinutesPerPage: round2(observedMpp),
    reason: `Logged ${round2(actuals.pages)} page(s) at ${round2(observedMpp)}m/page adjusts difficulty by ${lift}.`,
  };
}
