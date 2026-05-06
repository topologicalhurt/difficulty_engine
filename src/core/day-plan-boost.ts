import { chooseBoostTenths } from './day-plan-chunk-choice';
import type { PlanningState } from './internal-types';
import type { CalendarEntry, PlannerProjectV1 } from './types';

interface BoostCandidate {
  state: PlanningState;
  step: number;
  score: number;
}

// Prefer spreading boost days before repeatedly boosting the same book.
const FIRST_BOOST_BONUS = 0.1;

export interface BoostCandidateInput {
  entryStates: PlanningState[];
  entryMap: Record<string, CalendarEntry>;
  budgetLeft: number;
  project: PlannerProjectV1;
  isPracticalMode: boolean;
  priorityScore(state: PlanningState, hasEntry: boolean): number;
}

export function chooseBoostCandidate(
  input: BoostCandidateInput,
): BoostCandidate | null {
  return (
    input.entryStates
      .map<BoostCandidate | null>((state) => {
        const entry = input.entryMap[state.id];
        if (!entry) return null;
        const step = chooseBoostTenths(
          state,
          Math.round((entry.readPages + entry.skimPages) * 10),
          input.budgetLeft,
          input.project,
          input.isPracticalMode,
        );
        if (step <= 0) return null;
        return {
          state,
          step,
          score:
            input.priorityScore(state, true) +
            (entry.boosted ? 0 : FIRST_BOOST_BONUS),
        };
      })
      .filter((candidate): candidate is BoostCandidate => Boolean(candidate))
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.state.short.localeCompare(right.state.short),
      )[0] ?? null
  );
}
