import type { PlanningState } from './internal-types';
import type { PlannerProjectV1 } from './types';

export function splitTenths(
  state: PlanningState,
  take: number,
): { readTenths: number; skimTenths: number } {
  const remaining = Math.max(
    0,
    Math.min(state.remainingTenths, Math.round(take || 0)),
  );
  if (!remaining) return { readTenths: 0, skimTenths: 0 };
  const totalRemaining = Math.max(
    1,
    state.readRemainTenths + state.skimRemainTenths,
  );
  let readTake = Math.round(
    remaining * (state.readRemainTenths / totalRemaining),
  );
  readTake = Math.max(0, Math.min(readTake, state.readRemainTenths, remaining));
  let skimTake = Math.max(
    0,
    Math.min(remaining - readTake, state.skimRemainTenths),
  );
  let diff = remaining - (readTake + skimTake);
  if (diff > 0) {
    const addRead = Math.min(
      diff,
      Math.max(0, state.readRemainTenths - readTake),
    );
    readTake += addRead;
    diff -= addRead;
    skimTake += Math.min(diff, Math.max(0, state.skimRemainTenths - skimTake));
  }
  return { readTenths: readTake, skimTenths: skimTake };
}

export function marginalMinutesForTenths(
  state: PlanningState,
  tenths: number,
): number {
  const split = splitTenths(state, tenths);
  return (
    (split.readTenths / 10) * state.mppRead +
    (split.skimTenths / 10) * state.mppRead * (state.skimRatio || 0.35)
  );
}

export function consumeTenths(
  state: PlanningState,
  tenths: number,
): { tenths: number; readTenths: number; skimTenths: number; mins: number } {
  const take = Math.max(
    0,
    Math.min(state.remainingTenths, Math.round(tenths || 0)),
  );
  if (!take) return { tenths: 0, readTenths: 0, skimTenths: 0, mins: 0 };
  const split = splitTenths(state, take);
  const mins =
    (split.readTenths / 10) * state.mppRead +
    (split.skimTenths / 10) * state.mppRead * (state.skimRatio || 0.35);
  state.remainingTenths -= take;
  state.readRemainTenths -= split.readTenths;
  state.skimRemainTenths -= split.skimTenths;
  return {
    tenths: take,
    readTenths: split.readTenths,
    skimTenths: split.skimTenths,
    mins,
  };
}

export function totalHoursFallback(
  pages: number,
  diff: number,
  project: PlannerProjectV1,
  minutesPerPage: (
    difficulty: number,
    constraints: PlannerProjectV1['constraints'],
  ) => number,
): number {
  return (pages * minutesPerPage(diff, project.constraints)) / 60;
}
