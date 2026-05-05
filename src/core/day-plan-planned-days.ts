import { pageBounds, totalBudgetMinutes } from './constraints';
import type { PlanningState } from './internal-types';
import type { PlannerProjectV1 } from './types';
import { clamp, round1 } from './utils';

const FLOOR_RELAXATION_EPSILON = 0.05;
const TIME_FIT_EPSILON = 1e-9;

export function choosePlannedDaysForState(
  state: PlanningState,
  project: PlannerProjectV1,
  isPracticalMode: boolean,
): number | null {
  const bounds = pageBounds(project.constraints);
  const strictMinTenths = Math.max(
    10,
    Math.round((state.strictMinPg || bounds.minPg) * 10),
  );
  let minTenths = Math.max(
    10,
    Math.round(
      (state.effectiveMinPg || state.strictMinPg || bounds.minPg) * 10,
    ),
  );
  const maxTenths = Math.max(minTenths, Math.round(bounds.maxPg * 10));
  const averageMpp = Math.max(
    0.1,
    state.totalTenths
      ? state.mppRead *
          (state.readTotalTenths / state.totalTenths +
            (state.skimTotalTenths / state.totalTenths) *
              (state.skimRatio || 0.35))
      : state.mppRead,
  );
  const maxTenthsByTime = Math.max(
    1,
    Math.floor(
      (totalBudgetMinutes(project.constraints) / averageMpp) * 10 +
        TIME_FIT_EPSILON,
    ),
  );
  const maxTenthsFeasible = Math.min(maxTenths, maxTenthsByTime);
  const lowerByPages = Math.ceil(state.totalTenths / Math.max(1, maxTenths));
  const lowerByTime = Math.ceil(
    state.totalTenths / Math.max(1, maxTenthsFeasible),
  );
  const upperByPages =
    state.totalTenths < minTenths
      ? 1
      : Math.floor(state.totalTenths / Math.max(1, minTenths)) || 1;
  const lower = Math.max(1, lowerByPages, lowerByTime);
  let upper = Math.max(0, upperByPages);
  if (isPracticalMode && maxTenthsByTime >= 10 && upper < lower) {
    minTenths = Math.max(
      10,
      Math.min(minTenths, Math.floor(state.totalTenths / lower)),
    );
    state.effectiveMinPg = minTenths / 10;
    state.floorRelaxed =
      state.effectiveMinPg < state.strictMinPg - FLOOR_RELAXATION_EPSILON;
    state.relaxationReason = state.floorRelaxed
      ? `${round1(state.strictMinPg)} pg/day relaxed to ${round1(state.effectiveMinPg)} pg/day to preserve feasibility.`
      : state.relaxationReason;
    upper = Math.max(
      0,
      state.totalTenths < minTenths
        ? 1
        : Math.floor(state.totalTenths / Math.max(1, minTenths)) || 1,
    );
  }

  state.strictMinTenths = strictMinTenths;
  state.minTenths = minTenths;
  state.maxTenths = maxTenths;
  state.maxTenthsFeasible = maxTenthsFeasible;
  state.minFeasibleDays = lower;
  state.maxFeasibleDays = upper;

  if (state.manualWindowImpossibleReason) {
    state.infeasibleReason = state.manualWindowImpossibleReason;
    state.hardInfeasible = true;
    return null;
  }

  if (isPracticalMode) {
    if (maxTenthsByTime < 10 || upper < lower) {
      state.infeasibleReason = state.manualHardWindow
        ? `${state.short} cannot fit the manual window inside the current daily budget.`
        : `${state.short} cannot fit even 1.0 pg/day inside the full daily budget.`;
      state.hardInfeasible = true;
      return null;
    }
  } else if (maxTenthsByTime < strictMinTenths || upper < lower) {
    const floorPg = state.strictMinPg || bounds.minPg;
    const requiredMinutes = floorPg * averageMpp;
    state.infeasibleReason = `${state.short} needs ${round1(requiredMinutes)}m/day for the ${round1(floorPg)} pg/day floor, but only ${round1(totalBudgetMinutes(project.constraints))}m/day is available.`;
    state.hardInfeasible = true;
    return null;
  }

  state.hardInfeasible = false;
  if (state.manualDaysLocked) {
    const requestedDays = Math.max(1, Math.round(state.plannedDays || 1));
    if (requestedDays < lower || requestedDays > upper) {
      state.infeasibleReason =
        state.manualWindowImpossibleReason ||
        `${state.short} cannot fit the manual ${requestedDays}-day window while keeping the plan feasible.`;
      state.hardInfeasible = true;
      return null;
    }
    state.planDays = requestedDays;
    state.targetDayPages = round1(
      state.totalTenths / 10 / Math.max(1, state.planDays),
    );
    return state.planDays;
  }
  state.planDays = clamp(state.plannedDays || 1, lower, upper);
  state.targetDayPages = round1(
    state.totalTenths / 10 / Math.max(1, state.planDays),
  );
  return state.planDays;
}
