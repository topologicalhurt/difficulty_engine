import { DAY_PLAN_BUDGET_EPSILON_MINUTES } from './constants';
import { pageBounds } from './constraints';
import type { PlanningState } from './internal-types';
import type { PlannerProjectV1 } from './types';
import { clamp, safeNumber } from './utils';
import { marginalMinutesForTenths } from './day-plan-work';

function todayChunkBounds(
  state: PlanningState,
  currentTenthsToday: number,
  project: PlannerProjectV1,
  isPracticalMode: boolean,
): {
  current: number;
  daysInclToday: number;
  minTotal: number;
  maxTotal: number;
  remainingUniverse: number;
  desiredTotal: number;
} | null {
  const current = Math.max(0, Math.round(currentTenthsToday || 0));
  const usedBeforeToday = Math.max(0, state.usedDays - (current > 0 ? 1 : 0));
  const remainingUniverse = Math.max(0, state.remainingTenths + current);
  const preferredMinTenths =
    state.minTenths ||
    Math.max(10, Math.round(pageBounds(project.constraints).minPg * 10));
  const maxTenths = Math.min(
    state.maxTenthsFeasible ||
      Math.max(
        preferredMinTenths,
        Math.round(pageBounds(project.constraints).maxPg * 10),
      ),
    remainingUniverse,
  );
  if (!isPracticalMode) {
    const target = clamp(
      Math.round(
        (state.targetDayPages || state.effectiveMinPg || state.strictMinPg) *
          10,
      ),
      preferredMinTenths,
      Math.max(preferredMinTenths, maxTenths),
    );
    let desiredTotal = Math.min(target, remainingUniverse, maxTenths);
    const leftover = remainingUniverse - desiredTotal;
    if (
      leftover > 0 &&
      leftover < preferredMinTenths &&
      remainingUniverse <= maxTenths
    ) {
      desiredTotal = remainingUniverse;
    } else if (
      leftover > 0 &&
      leftover < preferredMinTenths &&
      desiredTotal + leftover <= maxTenths
    ) {
      desiredTotal += leftover;
    }
    const minTotal =
      remainingUniverse <= target || desiredTotal === remainingUniverse
        ? desiredTotal
        : Math.min(preferredMinTenths, desiredTotal);
    if (minTotal > maxTenths) return null;
    return {
      current,
      daysInclToday: 1,
      minTotal,
      maxTotal: maxTenths,
      remainingUniverse,
      desiredTotal: clamp(desiredTotal, minTotal, maxTenths),
    };
  }
  let daysInclToday = Math.max(1, (state.planDays || 1) - usedBeforeToday);
  let minTenths = preferredMinTenths;
  daysInclToday = Math.max(
    daysInclToday,
    Math.ceil(remainingUniverse / Math.max(1, preferredMinTenths)),
  );
  minTenths = Math.min(
    preferredMinTenths,
    Math.max(10, Math.floor(remainingUniverse / Math.max(1, daysInclToday))),
  );
  const daysAfter = Math.max(0, daysInclToday - 1);
  let minTotal: number;
  let maxTotal: number;
  if (daysInclToday === 1) {
    minTotal = remainingUniverse;
    maxTotal = remainingUniverse;
  } else {
    minTotal = Math.max(minTenths, remainingUniverse - daysAfter * maxTenths);
    maxTotal = Math.min(maxTenths, remainingUniverse - daysAfter * minTenths);
  }
  if (minTotal > maxTotal) return null;
  return {
    current,
    daysInclToday,
    minTotal,
    maxTotal,
    remainingUniverse,
    desiredTotal: minTotal,
  };
}

export function chooseStarterTenths(
  state: PlanningState,
  budgetLeft: number,
  project: PlannerProjectV1,
  isPracticalMode: boolean,
): number {
  const bounds = todayChunkBounds(state, 0, project, isPracticalMode);
  if (!bounds) return 0;
  const desired = bounds.desiredTotal;
  let best = 0;
  let bestScore = -Number.MAX_VALUE;
  for (let total = desired; total >= bounds.minTotal; total -= 1) {
    const mins = marginalMinutesForTenths(state, total);
    if (mins > budgetLeft + DAY_PLAN_BUDGET_EPSILON_MINUTES) continue;
    const score = -Math.abs(total - desired);
    if (score > bestScore) {
      best = total;
      bestScore = score;
    }
    if (total === desired) break;
  }
  if (!best) {
    for (let total = desired + 1; total <= bounds.maxTotal; total += 1) {
      const mins = marginalMinutesForTenths(state, total);
      if (mins > budgetLeft + DAY_PLAN_BUDGET_EPSILON_MINUTES) break;
      const score = -Math.abs(total - desired);
      if (score > bestScore) {
        best = total;
        bestScore = score;
      }
    }
  }
  return best;
}

export function chooseBoostTenths(
  state: PlanningState,
  currentTenthsToday: number,
  budgetLeft: number,
  project: PlannerProjectV1,
  isPracticalMode: boolean,
): number {
  const bounds = todayChunkBounds(
    state,
    currentTenthsToday,
    project,
    isPracticalMode,
  );
  if (!bounds || bounds.current >= bounds.maxTotal) return 0;
  const strength = clamp(
    safeNumber(project.constraints.boostStrength, 0.85),
    0,
    1,
  );
  const desiredTotal = clamp(
    Math.round(bounds.current + (bounds.maxTotal - bounds.current) * strength),
    Math.max(bounds.current + 1, bounds.minTotal),
    bounds.maxTotal,
  );
  let best = 0;
  let bestScore = -Number.MAX_VALUE;
  for (let total = desiredTotal; total > bounds.current; total -= 1) {
    const add = total - bounds.current;
    const mins = marginalMinutesForTenths(state, add);
    if (mins > budgetLeft + DAY_PLAN_BUDGET_EPSILON_MINUTES) continue;
    const score = -Math.abs(total - desiredTotal);
    if (score > bestScore) {
      best = add;
      bestScore = score;
    }
    if (total === desiredTotal) break;
  }
  return best;
}
