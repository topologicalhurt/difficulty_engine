import {
  SMART_OVERLAP_REMAINING_DAYS,
  SMART_OVERLAP_REMAINING_FRACTION,
} from './constants';
import {
  normalizeBackfillMode,
  normalizeEmptyDayPolicy,
  normalizePrereqMode,
} from './constraint-normalizers';
import { recordDeferredCalendarEntry } from './day-plan-overrides';
import type { DayPlanSnapshot, PlanningState } from './internal-types';
import type { PlannerProjectV1, SchedulePlan } from './types';

interface DayReadinessInput {
  project: PlannerProjectV1;
  schedulePlan: SchedulePlan;
  descendants: Record<string, Set<string>>;
  stateById: Record<string, PlanningState>;
  missedByDate: DayPlanSnapshot['missedByDate'];
}

export interface DayReadiness {
  strictCandidatesForDay(
    pending: PlanningState[],
    dateStr: string,
    slot: number,
  ): PlanningState[];
  blockedLaneSeedsForDay(
    pending: PlanningState[],
    dateStr: string,
    slot: number,
  ): PlanningState[];
  backfillCandidatesForDay(
    pending: PlanningState[],
    dateStr: string,
    slot: number,
    branchAnchors: string[],
    strictNow: PlanningState[],
  ): PlanningState[];
  prereqCandidatesForDay(
    pending: PlanningState[],
    dateStr: string,
    slot: number,
  ): PlanningState[];
}

export function createDayReadiness(input: DayReadinessInput): DayReadiness {
  const { project, schedulePlan, descendants, stateById, missedByDate } = input;
  const backfillMode = normalizeBackfillMode(project.constraints.backfillMode);
  const emptyDayPolicy = normalizeEmptyDayPolicy(
    project.constraints.emptyDayPolicy,
  );
  const prereqMode = normalizePrereqMode(project.constraints.prereqMode);

  const sharesBranch = (left: string, right: string): boolean =>
    left === right ||
    Boolean(descendants[left]?.has(right)) ||
    Boolean(descendants[right]?.has(left)) ||
    Boolean(
      schedulePlan.coStudyMeta.lookup[left] &&
      schedulePlan.coStudyMeta.lookup[left] ===
        schedulePlan.coStudyMeta.lookup[right],
    );

  const isDeferred = (state: PlanningState, dateStr: string): boolean => {
    if (!(project.manualOverrides.deferred[dateStr] || []).includes(state.id))
      return false;
    recordDeferredCalendarEntry(missedByDate, state, dateStr);
    return true;
  };

  const baseReady = (
    state: PlanningState,
    dateStr: string,
    slot: number,
  ): boolean => {
    if (state.remainingTenths <= 0 || state.infeasibleReason) return false;
    if (
      emptyDayPolicy === 'preserve_schedule_gaps' ||
      state.manualStartLocked ||
      state.coStudyGroup
    ) {
      if (slot < state.releaseSlot) return false;
    }
    return !isDeferred(state, dateStr);
  };

  const laneReady = (state: PlanningState): boolean =>
    !state.laneEnforced ||
    !state.lanePrevId ||
    (stateById[state.lanePrevId]?.remainingTenths || 0) <= 0;

  const unmetPrereqs = (state: PlanningState): string[] =>
    state.prereqs.filter(
      (parent) => (stateById[parent]?.remainingTenths || 0) > 0,
    );

  const prereqsReadyStrict = (state: PlanningState): boolean =>
    state.allowPrereqOverlap || !unmetPrereqs(state).length;

  const prereqsReadySmart = (state: PlanningState): boolean => {
    if (state.allowPrereqOverlap) return true;
    const unmet = unmetPrereqs(state);
    if (!unmet.length) return true;
    return unmet.every((parentId) => {
      const parent = stateById[parentId];
      if (!parent || parent.actualStart == null) return false;
      const remainingFraction =
        (parent.remainingTenths || 0) / Math.max(1, parent.totalTenths || 1);
      const remainingDays = Math.max(
        0,
        (parent.planDays || 1) - (parent.usedDays || 0),
      );
      return (
        remainingFraction <= SMART_OVERLAP_REMAINING_FRACTION ||
        remainingDays <= SMART_OVERLAP_REMAINING_DAYS
      );
    });
  };

  return {
    strictCandidatesForDay: (pending, dateStr, slot) =>
      pending.filter(
        (state) =>
          baseReady(state, dateStr, slot) &&
          laneReady(state) &&
          prereqsReadyStrict(state),
      ),
    blockedLaneSeedsForDay: (pending, dateStr, slot) =>
      pending.filter(
        (state) =>
          baseReady(state, dateStr, slot) &&
          !laneReady(state) &&
          prereqsReadyStrict(state),
      ),
    backfillCandidatesForDay: (
      pending,
      dateStr,
      slot,
      branchAnchors,
      strictNow,
    ) => {
      if (backfillMode === 'lane_preserving') return [];
      return pending.filter((state) => {
        if (!baseReady(state, dateStr, slot) || !prereqsReadyStrict(state))
          return false;
        if (strictNow.includes(state)) return false;
        if (backfillMode === 'global') return true;
        return branchAnchors.some((anchorId) =>
          sharesBranch(anchorId, state.id),
        );
      });
    },
    prereqCandidatesForDay: (pending, dateStr, slot) => {
      if (prereqMode === 'strict') return [];
      return pending.filter((state) => {
        if (!baseReady(state, dateStr, slot)) return false;
        if (state.laneEnforced && !laneReady(state)) return false;
        if (prereqsReadyStrict(state)) return false;
        if (prereqMode === 'smart_overlap') return prereqsReadySmart(state);
        return true;
      });
    },
  };
}
