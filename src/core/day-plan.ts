import {
  DEFAULT_TIMELINE_BUFFER_DAYS,
  MIN_TOTAL_TIMELINE_DAYS,
} from './constants';
import {
  normalizeDailyBookMode,
  normalizeFeasibilityMode,
  normalizeSchedAlgo,
} from './constraint-normalizers';
import { totalBudgetMinutes } from './constraints';
import { allocateDayEntries } from './day-plan-allocator';
import { commitDayEntries } from './day-plan-commit';
import {
  handleNoAllocatedEntries,
  handleNoEligibleCandidates,
} from './day-plan-empty';
import { choosePlannedDaysForState } from './day-plan-planned-days';
import { createDayReadiness } from './day-plan-readiness';
import {
  createStartabilitySummary,
  recordUnderfilledParallelSlots,
} from './day-plan-startability';
import { buildDayPlanBookStats } from './day-plan-stats';
import { buildOverlapMap, buildPlanningStates } from './day-plan-state';
import type {
  DayPlanSnapshot,
  OverlapCluster,
  PlanningState,
} from './internal-types';
import { descendantMap } from './schedule-graph';
import { compareChain, compareNumberAsc, compareText } from './sort';
import type { Clock, PlannerProjectV1, SchedulePlan } from './types';
import { unique } from './utils';

function pendingStates(states: PlanningState[]): PlanningState[] {
  return states.filter(
    (state) => state.remainingTenths > 0 && !state.infeasibleReason,
  );
}

function strictCoStudyGroups(
  schedulePlan: SchedulePlan,
): Record<string, Set<string>> {
  const groups: Record<string, Set<string>> = {};
  schedulePlan.coStudyMeta.groups.forEach((group) => {
    groups[group.id] = new Set(group.ids || []);
  });
  return groups;
}

function allCandidates(...groups: PlanningState[][]): PlanningState[] {
  return groups.flat();
}

export function buildDayPlan(
  project: PlannerProjectV1,
  schedulePlan: SchedulePlan,
  clusters: OverlapCluster[],
  clock: Clock,
): DayPlanSnapshot {
  const isPracticalMode =
    normalizeFeasibilityMode(project.constraints.feasibilityMode) ===
    'practical';
  const overlapMap = buildOverlapMap(project, clusters);
  const ordered = [...schedulePlan.items].sort((left, right) =>
    compareChain(
      compareNumberAsc(left.ds, right.ds),
      compareNumberAsc(left.lane, right.lane),
      compareText(left.short, right.short),
    ),
  );
  const graphPrereqs = schedulePlan.prereqById;
  const descendants = descendantMap(
    ordered.map((item) => item.id),
    graphPrereqs,
  );
  const states = buildPlanningStates(project, schedulePlan, overlapMap);
  const stateById = Object.fromEntries(
    states.map((state) => [state.id, state]),
  );
  states.forEach((state) => {
    choosePlannedDaysForState(state, project, isPracticalMode);
  });

  const start = clock.timelineStart(project);
  const byDate: DayPlanSnapshot['byDate'] = {};
  const byBook: DayPlanSnapshot['byBook'] = {};
  const missedByDate: DayPlanSnapshot['missedByDate'] = {};
  const startability = createStartabilitySummary();
  const budgetMinutes = totalBudgetMinutes(project.constraints);
  const maxParallel = Math.max(
    1,
    Math.trunc(project.constraints.par || 2) || 2,
  );
  const schedAlgo = normalizeSchedAlgo(project.constraints.schedAlgo);
  const dailyBookMode = normalizeDailyBookMode(
    project.constraints.dailyBookMode,
  );
  const strictGroups = strictCoStudyGroups(schedulePlan);
  const emptyDayContext = {
    project,
    clock,
    start,
    startability,
    stateById,
    budgetMinutes,
  };
  const readiness = createDayReadiness({
    project,
    schedulePlan,
    descendants,
    stateById,
    missedByDate,
  });

  let slot = 0;
  const maxSlots = Math.max(
    clock.totalTimelineSlots(project) +
      states.reduce(
        (total, state) => total + Math.max(1, state.planDays || 1),
        0,
      ) +
      DEFAULT_TIMELINE_BUFFER_DAYS,
    MIN_TOTAL_TIMELINE_DAYS,
  );

  while (slot < maxSlots) {
    const pending = pendingStates(states);
    if (!pending.length) break;
    const dateStr = clock.dateKey(clock.slotToDate(slot, start, project));
    const strictCandidates = readiness.strictCandidatesForDay(
      pending,
      dateStr,
      slot,
    );
    const branchAnchors = unique(
      readiness
        .blockedLaneSeedsForDay(pending, dateStr, slot)
        .map((state) => state.id),
    );
    const backfillCandidates = readiness.backfillCandidatesForDay(
      pending,
      dateStr,
      slot,
      branchAnchors,
      strictCandidates,
    );
    const prereqCandidates = readiness.prereqCandidatesForDay(
      pending,
      dateStr,
      slot,
    );

    if (
      !allCandidates(strictCandidates, backfillCandidates, prereqCandidates)
        .length
    ) {
      const resolution = handleNoEligibleCandidates(
        emptyDayContext,
        pending,
        slot,
      );
      if (resolution.kind === 'jump') {
        slot = resolution.slot;
        continue;
      }
      break;
    }

    const allocation = allocateDayEntries({
      project,
      dateStr,
      pending,
      strictCandidates,
      backfillCandidates,
      prereqCandidates,
      strictGroups,
      budgetMinutes,
      maxParallel,
      isPracticalMode,
      dailyBookMode,
      schedAlgo,
      slot,
      stateCount: states.length,
      recomputeBackfillCandidates: (entryAnchors) =>
        readiness.backfillCandidatesForDay(
          pending,
          dateStr,
          slot,
          unique([...branchAnchors, ...entryAnchors]),
          strictCandidates,
        ),
      recomputePrereqCandidates: () =>
        readiness.prereqCandidatesForDay(pending, dateStr, slot),
    });

    const candidatePool = allCandidates(
      strictCandidates,
      allocation.backfillCandidates,
      allocation.prereqCandidates,
    );
    if (!allocation.dayEntries.length) {
      const resolution = handleNoAllocatedEntries(
        emptyDayContext,
        pending,
        slot,
        candidatePool,
      );
      if (resolution.kind === 'jump') {
        slot = resolution.slot;
        continue;
      }
      break;
    }

    recordUnderfilledParallelSlots(
      startability,
      dateStr,
      allocation.dayEntries,
      maxParallel,
      candidatePool,
      budgetMinutes,
    );
    commitDayEntries(
      byDate,
      byBook,
      stateById,
      dateStr,
      slot,
      allocation.dayEntries,
    );
    slot += 1;
  }

  const byBookStats = buildDayPlanBookStats(project, states, stateById);
  return {
    start,
    byDate,
    byBook,
    missedByDate,
    byBookStats,
    overlapMap,
    startability,
  };
}
