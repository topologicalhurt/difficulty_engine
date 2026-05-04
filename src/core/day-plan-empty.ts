import { assignPendingBlockers, nextPendingRelease } from './day-plan-blockers';
import { recordEmptyStudySlots, strictParallelFitDetail } from './day-plan-fit';
import type { DayPlanSnapshot, PlanningState } from './internal-types';
import type { Clock, PlannerProjectV1 } from './types';

interface EmptyDayContext {
  project: PlannerProjectV1;
  clock: Clock;
  start: Date;
  startability: DayPlanSnapshot['startability'];
  stateById: Record<string, PlanningState>;
  budgetMinutes: number;
}

export type EmptyDayResolution = { kind: 'jump'; slot: number } | { kind: 'break' };

function recordWaitingReleaseGap(
  context: EmptyDayContext,
  fromSlot: number,
  toSlot: number,
): void {
  recordEmptyStudySlots(
    context.startability.emptyStudyDays,
    context.clock,
    context.start,
    context.project,
    fromSlot,
    toSlot,
    'waiting_for_release',
    'Waiting for the next hard release slot.',
  );
}

function jumpToNextReleaseIfAny(
  context: EmptyDayContext,
  pending: PlanningState[],
  slot: number,
): EmptyDayResolution | null {
  const nextRelease = nextPendingRelease(pending, slot);
  if (!Number.isFinite(nextRelease) || nextRelease <= slot) return null;
  recordWaitingReleaseGap(context, slot, nextRelease);
  return { kind: 'jump', slot: nextRelease };
}

export function handleNoEligibleCandidates(
  context: EmptyDayContext,
  pending: PlanningState[],
  slot: number,
): EmptyDayResolution {
  const releaseJump = jumpToNextReleaseIfAny(context, pending, slot);
  if (releaseJump) return releaseJump;
  recordEmptyStudySlots(
    context.startability.emptyStudyDays,
    context.clock,
    context.start,
    context.project,
    slot,
    slot + 1,
    'blocked',
    'No book is eligible under the current prerequisite, lane, or manual schedule constraints.',
  );
  assignPendingBlockers(
    pending,
    context.stateById,
    slot,
    context.budgetMinutes,
    new Set(),
  );
  return { kind: 'break' };
}

export function handleNoAllocatedEntries(
  context: EmptyDayContext,
  pending: PlanningState[],
  slot: number,
  candidatePool: PlanningState[],
): EmptyDayResolution {
  const releaseJump = jumpToNextReleaseIfAny(context, pending, slot);
  if (releaseJump) return releaseJump;
  const blockedCandidateIds = new Set(candidatePool.map((state) => state.id));
  recordEmptyStudySlots(
    context.startability.emptyStudyDays,
    context.clock,
    context.start,
    context.project,
    slot,
    slot + 1,
    blockedCandidateIds.size ? 'no_feasible_chunk' : 'blocked',
    blockedCandidateIds.size
      ? strictParallelFitDetail(context.project, candidatePool, 0)
      : 'No book is eligible under the current prerequisite, lane, or manual schedule constraints.',
  );
  assignPendingBlockers(
    pending,
    context.stateById,
    slot,
    context.budgetMinutes,
    blockedCandidateIds,
  );
  return { kind: 'break' };
}
