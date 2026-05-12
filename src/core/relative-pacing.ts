import {
  effectiveFloorPg,
  minutesPerPage,
  pageBounds,
  slotBudgetMinutes,
  totalBudgetMinutes,
} from './constraints';
import { profilePolicy } from './profile-policy';
import type { ConstraintSet } from './types';
import { clamp, round1, safeNumber } from './utils';

export type PacingBindingReason =
  | 'none'
  | 'floor_bound'
  | 'time_bound'
  | 'max_bound'
  | 'manual_window'
  | 'parallel_slot'
  | 'insufficient_evidence';

export interface PacingBookInput {
  id: string;
  title: string;
  pages: number;
  difficulty: number;
  evidenceConfidence?: number;
}

export interface PacingBookTarget {
  absolutePageTarget: number;
  relativePageTarget: number;
  relativePacingPercentile: number;
  pacingPageTarget: number;
  desiredPagesPerDay: number;
  feasibleMinPagesPerDay: number;
  feasibleMaxPagesPerDay: number;
  finalPagesPerDay: number;
  pacingBindingReason: PacingBindingReason;
}

function percentileByRank(index: number, count: number): number {
  return count <= 1 ? 0.5 : index / Math.max(1, count - 1);
}

function curvedPercentile(value: number, constraints: ConstraintSet): number {
  const t = clamp(value, 0, 1);
  switch (constraints.relativePacingCurve) {
    case 'linear':
      return t;
    case 'sqrt':
      return Math.sqrt(t);
    case 'power':
      return t * t;
    case 'smoothstep':
    default:
      return t * t * (3 - 2 * t);
  }
}

function pageTargetBindingReason(input: {
  desired: number;
  final: number;
  floor: number;
  maxFeasible: number;
  maxPg: number;
  slotTimeBound: number;
  evidenceConfidence: number;
}): PacingBindingReason {
  if (input.evidenceConfidence < 0.35) return 'insufficient_evidence';
  if (input.maxFeasible < input.floor) {
    return input.slotTimeBound < input.floor ? 'parallel_slot' : 'time_bound';
  }
  if (input.desired < input.floor && input.final >= input.floor) {
    return 'floor_bound';
  }
  if (input.desired > input.maxFeasible) {
    return input.maxFeasible < input.maxPg ? 'time_bound' : 'max_bound';
  }
  return 'none';
}

function wholePagePlanningTarget(input: {
  target: number;
  floor: number;
  maxFeasible: number;
}): number {
  const minWhole = Math.max(1, Math.ceil(input.floor));
  const maxWhole = Math.floor(input.maxFeasible);
  if (maxWhole < minWhole) {
    return round1(
      clamp(input.target, input.floor, Math.max(input.floor, input.maxFeasible)),
    );
  }
  return clamp(Math.round(input.target), minWhole, maxWhole);
}

export function computeRelativePacingTargets(
  books: PacingBookInput[],
  constraints: ConstraintSet,
): Record<string, PacingBookTarget> {
  const bounds = pageBounds(constraints);
  const policy = profilePolicy(constraints);
  const profile = policy.profile;
  const challenge = policy.challengeMultiplier;
  const ranked = [...books].sort(
    (left, right) =>
      left.difficulty - right.difficulty ||
      left.title.localeCompare(right.title) ||
      left.id.localeCompare(right.id),
  );
  const percentileById = Object.fromEntries(
    ranked.map((book, index) => [
      book.id,
      percentileByRank(index, ranked.length),
    ]),
  );

  return Object.fromEntries(
    books.map((book) => {
      const percentile = percentileById[book.id] ?? 0.5;
      const curved = curvedPercentile(percentile, constraints);
      const evidenceConfidence = clamp(safeNumber(book.evidenceConfidence, 0.7), 0, 1);
      const spreadStrength =
        (clamp(profile.pacingSpread, 0, 100) / 100) *
        clamp(evidenceConfidence / Math.max(0.1, profile.uncertaintyTolerance), 0.15, 1);
      const floor = effectiveFloorPg(book.difficulty, constraints);
      const mpp = Math.max(0.1, minutesPerPage(book.difficulty, constraints));
      const slotTimeBound = slotBudgetMinutes(constraints) / mpp;
      const dayTimeBound = totalBudgetMinutes(constraints) / mpp;
      const absoluteTarget = clamp(slotTimeBound * challenge, 0.1, bounds.maxPg);
      const relativeTarget =
        bounds.maxPg - curved * Math.max(0, bounds.maxPg - bounds.minPg);
      const rawDesired =
        absoluteTarget * (1 - spreadStrength) + relativeTarget * spreadStrength;
      const desired =
        evidenceConfidence < 0.6 ? Math.min(rawDesired, absoluteTarget) : rawDesired;
      const maxFeasible = Math.min(bounds.maxPg, dayTimeBound);
      const unclippedFinal = clamp(desired, floor, Math.max(floor, maxFeasible));
      const final = wholePagePlanningTarget({
        target: unclippedFinal,
        floor,
        maxFeasible,
      });
      return [
        book.id,
        {
          absolutePageTarget: round1(absoluteTarget),
          relativePageTarget: round1(relativeTarget),
          relativePacingPercentile: round1(percentile * 100),
          pacingPageTarget: final,
          desiredPagesPerDay: round1(desired),
          feasibleMinPagesPerDay: round1(floor),
          feasibleMaxPagesPerDay: round1(maxFeasible),
          finalPagesPerDay: final,
          pacingBindingReason: pageTargetBindingReason({
            desired,
            final,
            floor,
            maxFeasible,
            maxPg: bounds.maxPg,
            slotTimeBound,
            evidenceConfidence,
          }),
        },
      ];
    }),
  );
}
