import {
  DAILY_COHORT_ACTIVE_BONUS,
  DAILY_COHORT_NEW_START_PENALTY,
} from './constants';
import type { PlanningState } from './internal-types';
import type { DailyBookMode, ScheduleAlgorithm } from './types';

interface PriorityContext {
  stateCount: number;
  schedAlgo: ScheduleAlgorithm;
  dailyBookMode: DailyBookMode;
  slot: number;
  hasEntry: boolean;
}

export function dayPlanningPriorityScore(
  state: PlanningState,
  context: PriorityContext,
): number {
  const rankPressure =
    (context.stateCount -
      Math.min(context.stateCount, Math.max(0, state.scheduleRank || 0))) /
    Math.max(1, context.stateCount);
  const strategyPressure =
    context.schedAlgo === 'greedy'
      ? rankPressure * 1.2 + (state.eff || 0) * 0.38
      : context.schedAlgo === 'balanced'
        ? rankPressure * 1.8 + (state.eff || 0) * 0.18
        : context.schedAlgo === 'critical'
          ? rankPressure * 3.4 + (state.eff || 0) * 0.12
          : rankPressure * 4.2 + (state.eff || 0) * 0.08;
  const usedBeforeToday = Math.max(
    0,
    state.usedDays - (context.hasEntry ? 1 : 0),
  );
  const daysLeft = Math.max(1, (state.planDays || 1) - usedBeforeToday);
  const due = state.releaseSlot + (state.planDays || 1);
  const slack = due - context.slot - daysLeft;
  const lateness = Math.max(0, context.slot - due);
  const slackWeight =
    context.schedAlgo === 'fastest'
      ? 0.2
      : context.schedAlgo === 'critical'
        ? 0.6
        : 1.8;
  const latenessWeight =
    context.schedAlgo === 'fastest'
      ? 0.2
      : context.schedAlgo === 'critical'
        ? 0.4
        : 1.8;
  const cohortContinuity =
    context.dailyBookMode === 'daily_cohort'
      ? state.actualStart == null
        ? -DAILY_COHORT_NEW_START_PENALTY
        : DAILY_COHORT_ACTIVE_BONUS
      : 0;
  return (
    strategyPressure +
    Math.max(0, -slack) * slackWeight +
    lateness * latenessWeight +
    (state.actualStart == null ? 0.25 : 0.08) +
    cohortContinuity
  );
}
