import {
  pageBounds,
  slotBudgetMinutes,
  totalBudgetMinutes,
} from './constraints';
import { marginalMinutesForTenths } from './day-plan-work';
import type { PlanningState } from './internal-types';
import type { Clock, PlannerProjectV1 } from './types';
import { round1, unique } from './utils';

const EPSILON_MINUTES = 1e-6;

export type EmptyStudyReason = 'waiting_for_release' | 'blocked' | 'no_feasible_chunk';

export interface EmptyStudyDay {
  dateStr: string;
  reason: EmptyStudyReason;
  detail: string;
}

function starterChunkTenths(state: PlanningState): number {
  return Math.max(
    1,
    Math.min(
      state.remainingTenths,
      state.minTenths || state.strictMinTenths || Math.round(state.strictMinPg * 10),
    ),
  );
}

export function starterChunkMinutes(state: PlanningState): number {
  return marginalMinutesForTenths(state, starterChunkTenths(state));
}

export function feasibleCandidateCount(
  candidates: PlanningState[],
  budgetMinutes: number,
): number {
  const byId = new Map(candidates.map((state) => [state.id, state]));
  let usedMinutes = 0;
  let count = 0;
  [...byId.values()]
    .map((state) => starterChunkMinutes(state))
    .sort((left, right) => left - right)
    .forEach((minutes) => {
      if (usedMinutes + minutes <= budgetMinutes + EPSILON_MINUTES) {
        usedMinutes += minutes;
        count += 1;
      }
    });
  return count;
}

export function strictParallelFitDetail(
  project: PlannerProjectV1,
  candidates: PlanningState[],
  feasibleBooks: number,
): string {
  const strictMinPg = pageBounds(project.constraints).minPg;
  const requestedBooks = Math.max(1, Math.trunc(project.constraints.par || 1));
  const dailyBudget = totalBudgetMinutes(project.constraints);
  const slotBudget = slotBudgetMinutes(project.constraints);
  const chunks = unique(candidates.map((state) => state.id))
    .map((id) => candidates.find((state) => state.id === id))
    .filter(Boolean)
    .map((state) => starterChunkMinutes(state as PlanningState));
  const largest = chunks.length ? Math.max(...chunks) : 0;
  return `${requestedBooks} parallel slot(s) requested, but strict ${strictMinPg} pg chunks fit at most ${feasibleBooks} book(s) inside ${round1(dailyBudget)}m/day. Each slot has ${round1(slotBudget)}m; the largest eligible chunk needs ${round1(largest)}m.`;
}

export function recordEmptyStudySlots(
  target: EmptyStudyDay[],
  clock: Clock,
  start: Date,
  project: PlannerProjectV1,
  fromSlot: number,
  toSlot: number,
  reason: EmptyStudyReason,
  detail: string,
): void {
  for (let current = fromSlot; current < toSlot; current += 1) {
    target.push({
      dateStr: clock.dateKey(clock.slotToDate(current, start, project)),
      reason,
      detail,
    });
  }
}
