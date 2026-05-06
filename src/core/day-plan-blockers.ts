import type { PlanningState } from './internal-types';
import { round1 } from './utils';

export function nextPendingRelease(
  pending: PlanningState[],
  slot: number,
): number {
  return pending.reduce(
    (best, state) =>
      state.releaseSlot > slot ? Math.min(best, state.releaseSlot) : best,
    Number.POSITIVE_INFINITY,
  );
}

function unmetPrereqNames(
  state: PlanningState,
  stateById: Record<string, PlanningState>,
): string[] {
  return state.prereqs
    .filter((parent) => (stateById[parent]?.remainingTenths || 0) > 0)
    .map((parent) => stateById[parent]?.short || parent);
}

function noFitReason(state: PlanningState, dailyBudgetMinutes: number): string {
  const floorPages = state.effectiveMinPg || state.strictMinPg;
  const floorMinutes = floorPages * state.mppRead;
  return `No feasible day chunk fits inside ${round1(dailyBudgetMinutes)}m/day: ${round1(floorPages)} pg/day at ${round1(state.mppRead)}m/page needs about ${round1(floorMinutes)}m before synchronized group/window constraints.`;
}

export function assignPendingBlockers(
  pending: PlanningState[],
  stateById: Record<string, PlanningState>,
  slot: number,
  dailyBudgetMinutes: number,
  candidateIds: Set<string>,
): void {
  pending.forEach((state) => {
    if (state.blockedReason || state.infeasibleReason) return;
    const prereqNames = unmetPrereqNames(state, stateById);
    if (state.manualWindowImpossibleReason) {
      state.blockedReason = state.manualWindowImpossibleReason;
    } else if (state.releaseSlot > slot) {
      state.blockedReason = `Waiting for release slot ${state.releaseSlot}`;
    } else if (
      state.laneEnforced &&
      state.lanePrevId &&
      (stateById[state.lanePrevId]?.remainingTenths || 0) > 0
    ) {
      state.blockedReason = `Waiting on lane predecessor ${stateById[state.lanePrevId]?.short || state.lanePrevId}`;
    } else if (!state.allowPrereqOverlap && prereqNames.length) {
      state.blockedReason = `Waiting on prerequisites: ${prereqNames.join(', ')}`;
    } else if (candidateIds.has(state.id)) {
      state.blockedReason = noFitReason(state, dailyBudgetMinutes);
    } else {
      state.blockedReason =
        'No feasible day chunk under the current constraints';
    }
  });
}
