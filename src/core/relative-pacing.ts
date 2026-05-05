import {
  dailyPagesTarget,
  effectiveFloorPg,
  minutesPerPage,
  pageBounds,
  slotBudgetMinutes,
} from './constraints';
import type { ConstraintSet } from './types';
import { clamp, round1, safeNumber } from './utils';

export interface PacingBookInput {
  id: string;
  title: string;
  pages: number;
  difficulty: number;
}

export interface PacingBookTarget {
  absolutePageTarget: number;
  relativePageTarget: number;
  relativePacingPercentile: number;
  pacingPageTarget: number;
}

function pacingStrength(constraints: ConstraintSet): number {
  return (
    clamp(safeNumber(constraints.relativePacingStrength, 50), 0, 100) / 100
  );
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

export function computeRelativePacingTargets(
  books: PacingBookInput[],
  constraints: ConstraintSet,
): Record<string, PacingBookTarget> {
  const bounds = pageBounds(constraints);
  const strength = pacingStrength(constraints);
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
      const absoluteTarget = dailyPagesTarget(
        book.pages,
        book.difficulty,
        constraints,
      );
      const percentile = percentileById[book.id] ?? 0.5;
      const curved = curvedPercentile(percentile, constraints);
      const floor = effectiveFloorPg(book.difficulty, constraints);
      const timeBoundMax =
        slotBudgetMinutes(constraints) /
        Math.max(0.1, minutesPerPage(book.difficulty, constraints));
      const maxTarget = Math.max(floor, Math.min(bounds.maxPg, timeBoundMax));
      const recommendationFloor = Math.min(bounds.minPg, maxTarget);
      const relativeTarget =
        maxTarget - curved * (maxTarget - recommendationFloor);
      const blendedTarget =
        absoluteTarget * (1 - strength) + relativeTarget * strength;
      return [
        book.id,
        {
          absolutePageTarget: round1(absoluteTarget),
          relativePageTarget: round1(relativeTarget),
          relativePacingPercentile: round1(percentile * 100),
          pacingPageTarget: round1(clamp(blendedTarget, floor, maxTarget)),
        },
      ];
    }),
  );
}
