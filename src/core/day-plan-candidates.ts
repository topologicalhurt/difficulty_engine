import { normalizePrereqMode } from './constraint-normalizers';
import {
  DAY_PLAN_BACKFILL_STAGE_PENALTY,
  DAY_PLAN_BUDGET_EPSILON_MINUTES,
  DAY_PLAN_CANDIDATE_SCAN_LIMIT,
  DAY_PLAN_COSTUDY_GROUP_BONUS_PER_MEMBER,
  DAY_PLAN_SMART_PREREQ_STAGE_PENALTY,
  DAY_PLAN_SOFT_PREREQ_STAGE_PENALTY,
} from './constants';
import { chooseStarterTenths } from './day-plan-chunk-choice';
import { marginalMinutesForTenths } from './day-plan-work';
import type { PlanningState } from './internal-types';
import type { DailyBookMode, PlannerProjectV1 } from './types';
import { mean, sum } from './utils';

export type DayStartMode = 'strict' | 'backfill' | 'prereq';

export interface CandidateMember {
  state: PlanningState;
  step: number;
}

export interface CandidateSet {
  members: CandidateMember[];
  score: number;
}

interface CandidateSetInput {
  project: PlannerProjectV1;
  candidates: PlanningState[];
  stage: DayStartMode;
  strictGroups: Record<string, Set<string>>;
  entryIds: Set<string>;
  dayEntriesLength: number;
  dayUsedMinutes: number;
  budgetMinutes: number;
  maxParallel: number;
  isPracticalMode: boolean;
  dailyBookMode: DailyBookMode;
  priorityScore(state: PlanningState, hasEntry: boolean): number;
}

function stagePenalty(project: PlannerProjectV1, stage: DayStartMode): number {
  if (stage === 'backfill') return DAY_PLAN_BACKFILL_STAGE_PENALTY;
  if (stage !== 'prereq') return 0;
  return normalizePrereqMode(project.constraints.prereqMode) === 'soft'
    ? DAY_PLAN_SOFT_PREREQ_STAGE_PENALTY
    : DAY_PLAN_SMART_PREREQ_STAGE_PENALTY;
}

function groupedCandidates(
  candidates: PlanningState[],
  entryIds: Set<string>,
): Record<string, PlanningState[]> {
  const grouped: Record<string, PlanningState[]> = {};
  candidates
    .filter((state) => !entryIds.has(state.id))
    .forEach((state) => {
      const key = state.coStudyGroup || `solo:${state.id}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(state);
    });
  return grouped;
}

function candidateFrontier(input: CandidateSetInput): PlanningState[] {
  if (input.candidates.length <= DAY_PLAN_CANDIDATE_SCAN_LIMIT) {
    return input.candidates;
  }
  const ranked = [...input.candidates].sort(
    (left, right) =>
      input.priorityScore(right, false) - input.priorityScore(left, false) ||
      left.short.localeCompare(right.short),
  );
  const feasible: PlanningState[] = [];
  const deferred: PlanningState[] = [];
  const budgetLeft = input.budgetMinutes - input.dayUsedMinutes;
  for (const state of ranked) {
    const step = chooseStarterTenths(
      state,
      budgetLeft,
      input.project,
      input.isPracticalMode,
    );
    if (step > 0) {
      feasible.push(state);
      if (feasible.length >= DAY_PLAN_CANDIDATE_SCAN_LIMIT) break;
      continue;
    }
    if (deferred.length < DAY_PLAN_CANDIDATE_SCAN_LIMIT) {
      deferred.push(state);
    }
  }
  return feasible.length >= DAY_PLAN_CANDIDATE_SCAN_LIMIT
    ? feasible
    : [
        ...feasible,
        ...deferred.slice(0, DAY_PLAN_CANDIDATE_SCAN_LIMIT - feasible.length),
      ];
}

function isStrictSynchronizedGroup(
  key: string,
  groupStates: PlanningState[],
  strictGroups: Record<string, Set<string>>,
  candidateSet: Set<string>,
): boolean {
  return Boolean(
    strictGroups[key] &&
    strictGroups[key].size === groupStates.length &&
    groupStates.length > 1 &&
    [...strictGroups[key]].every((id) => candidateSet.has(id)),
  );
}

function compareCandidateSets(
  dailyBookMode: DailyBookMode,
  isPracticalMode: boolean,
  left: CandidateSet,
  right: CandidateSet,
): number {
  if (dailyBookMode === 'daily_cohort') {
    const leftActive = left.members.filter(
      (member) => member.state.actualStart != null,
    ).length;
    const rightActive = right.members.filter(
      (member) => member.state.actualStart != null,
    ).length;
    if (leftActive !== rightActive) return rightActive - leftActive;
    if (leftActive > 0 && left.members.length !== right.members.length) {
      return left.members.length - right.members.length;
    }
  }
  if (isPracticalMode && left.members.length !== right.members.length) {
    return right.members.length - left.members.length;
  }
  return right.score - left.score || left.members.length - right.members.length;
}

export function buildCandidateSets(input: CandidateSetInput): CandidateSet[] {
  const penalty = stagePenalty(input.project, input.stage);
  const candidates = candidateFrontier(input);
  const candidateSet = new Set(candidates.map((state) => state.id));
  const sets: CandidateSet[] = [];

  Object.entries(groupedCandidates(candidates, input.entryIds)).forEach(
    ([key, groupStates]) => {
      if (
        isStrictSynchronizedGroup(
          key,
          groupStates,
          input.strictGroups,
          candidateSet,
        )
      ) {
        const steps = groupStates
          .map((state) => ({
            state,
            step: chooseStarterTenths(
              state,
              input.budgetMinutes - input.dayUsedMinutes,
              input.project,
              input.isPracticalMode,
            ),
          }))
          .filter((member) => member.step > 0);
        const totalMins = sum(
          steps.map((member) =>
            marginalMinutesForTenths(member.state, member.step),
          ),
        );
        if (
          steps.length === groupStates.length &&
          input.dayEntriesLength + steps.length <=
            Math.max(input.maxParallel, steps.length) &&
          totalMins <=
            input.budgetMinutes -
              input.dayUsedMinutes +
              DAY_PLAN_BUDGET_EPSILON_MINUTES
        ) {
          sets.push({
            members: steps,
            score:
              mean(
                steps.map((member) => input.priorityScore(member.state, false)),
              ) +
              DAY_PLAN_COSTUDY_GROUP_BONUS_PER_MEMBER * steps.length -
              penalty,
          });
        }
        return;
      }

      groupStates.forEach((state) => {
        const step = chooseStarterTenths(
          state,
          input.budgetMinutes - input.dayUsedMinutes,
          input.project,
          input.isPracticalMode,
        );
        if (step > 0) {
          sets.push({
            members: [{ state, step }],
            score: input.priorityScore(state, false) - penalty,
          });
        }
      });
    },
  );

  return sets.sort((left, right) =>
    compareCandidateSets(
      input.dailyBookMode,
      input.isPracticalMode,
      left,
      right,
    ),
  );
}
