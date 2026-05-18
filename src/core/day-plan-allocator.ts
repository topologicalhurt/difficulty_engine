import { buildCandidateSets, type DayStartMode } from './day-plan-candidates';
import {
  DAY_PLAN_ACTIVE_BUDGET_EPSILON_MINUTES,
  DAY_PLAN_ALLOCATION_GUARD_LIMIT,
} from './constants';
import { chooseBoostCandidate } from './day-plan-boost';
import { createCalendarEntry } from './day-plan-entry';
import { consumeTenths } from './day-plan-work';
import {
  calendarActualOverride,
  hasActualProgressOverride,
  tenthsForActualOverride,
} from './day-plan-overrides';
import { dayPlanningPriorityScore } from './day-plan-priority';
import type { PlanningState } from './internal-types';
import type {
  CalendarEntry,
  DailyBookMode,
  PlannerProjectV1,
  ScheduleAlgorithm,
} from './types';

export interface DayAllocationInput {
  project: PlannerProjectV1;
  dateStr: string;
  pending: PlanningState[];
  strictCandidates: PlanningState[];
  backfillCandidates: PlanningState[];
  prereqCandidates: PlanningState[];
  strictGroups: Record<string, Set<string>>;
  budgetMinutes: number;
  maxParallel: number;
  isPracticalMode: boolean;
  dailyBookMode: DailyBookMode;
  schedAlgo: ScheduleAlgorithm;
  slot: number;
  stateCount: number;
  recomputeBackfillCandidates(branchAnchors: string[]): PlanningState[];
  recomputePrereqCandidates(): PlanningState[];
}

export interface DayAllocationResult {
  dayEntries: CalendarEntry[];
  entryMap: Record<string, CalendarEntry>;
  dayUsedMinutes: number;
  backfillCandidates: PlanningState[];
  prereqCandidates: PlanningState[];
}

// Daily allocation is the per-day resource projection of the schedule:
// precedence, time budget, and hard parallel capacity all bind before desired
// pacing can place work on the calendar.
export function allocateDayEntries(
  input: DayAllocationInput,
): DayAllocationResult {
  const dayEntries: CalendarEntry[] = [];
  const entryMap: Record<string, CalendarEntry> = {};
  const entryStates: PlanningState[] = [];
  const entryIds = new Set<string>();
  const actualLocked = new Set<string>();
  let dayUsedMinutes = 0;
  let latestBackfillCandidates = input.backfillCandidates;
  let latestPrereqCandidates = input.prereqCandidates;

  const priorityScore = (state: PlanningState, hasEntry: boolean): number =>
    dayPlanningPriorityScore(state, {
      stateCount: input.stateCount,
      schedAlgo: input.schedAlgo,
      dailyBookMode: input.dailyBookMode,
      slot: input.slot,
      hasEntry,
    });

  const ensureEntry = (
    state: PlanningState,
    startMode: DayStartMode,
  ): CalendarEntry => {
    const existing = entryMap[state.id];
    if (existing) return existing;
    const entry = createCalendarEntry(
      input.project,
      state,
      input.dateStr,
      startMode,
    );
    entryMap[state.id] = entry;
    entryIds.add(state.id);
    entryStates.push(state);
    dayEntries.push(entry);
    state.usedDays += 1;
    if (state.actualStart == null) {
      state.startPolicy = startMode;
      if (startMode === 'backfill') state.backfilled = true;
      if (startMode === 'prereq') state.prereqOverlapUsed = true;
    }
    return entry;
  };

  const allocateTo = (
    state: PlanningState,
    stepTenths: number,
    boosted: boolean,
    startMode: DayStartMode,
  ): boolean => {
    if (stepTenths <= 0) return false;
    const override = calendarActualOverride(
      input.project,
      state,
      input.dateStr,
    );
    const hasProgressOverride = hasActualProgressOverride(override);
    if (hasProgressOverride && actualLocked.has(state.id)) return false;
    let requestedTenths = tenthsForActualOverride(state, override, stepTenths);
    if (requestedTenths <= 0) return false;
    if (!input.isPracticalMode && !hasProgressOverride) {
      const existing = entryMap[state.id];
      const currentTenths = existing
        ? Math.round((existing.readPages + existing.skimPages) * 10)
        : 0;
      const leftover = state.remainingTenths - requestedTenths;
      if (leftover > 0 && leftover < state.minTenths) {
        const adjusted = requestedTenths - (state.minTenths - leftover);
        if (adjusted > 0 && currentTenths + adjusted >= state.minTenths) {
          requestedTenths = adjusted;
        } else {
          return false;
        }
      }
    }
    const entry = ensureEntry(state, startMode);
    if (hasProgressOverride) {
      actualLocked.add(state.id);
      entry.actualOverride = true;
      entry.actualMinutes = override?.minutes;
      entry.actualPages = override?.pages;
      entry.done = Boolean(override?.done);
    }
    const allocation = consumeTenths(state, requestedTenths);
    if (allocation.tenths <= 0) return false;
    entry.mins +=
      override?.minutes != null ? override.minutes : allocation.mins;
    entry.readPages += allocation.readTenths / 10;
    entry.skimPages += allocation.skimTenths / 10;
    if (boosted) entry.boosted = true;
    dayUsedMinutes +=
      override?.minutes != null ? override.minutes : allocation.mins;
    return true;
  };

  const allocateActualOverrides = (): void => {
    input.pending
      .filter((state) =>
        hasActualProgressOverride(
          calendarActualOverride(input.project, state, input.dateStr),
        ),
      )
      .sort(
        (left, right) =>
          priorityScore(right, false) - priorityScore(left, false) ||
          left.short.localeCompare(right.short),
      )
      .forEach((state) => {
        allocateTo(state, state.remainingTenths, false, 'strict');
      });
  };

  const fillStage = (
    candidates: PlanningState[],
    stage: DayStartMode,
  ): void => {
    let guard = 0;
    while (
      dayUsedMinutes <
        input.budgetMinutes - DAY_PLAN_ACTIVE_BUDGET_EPSILON_MINUTES &&
      entryIds.size < input.maxParallel &&
      guard < DAY_PLAN_ALLOCATION_GUARD_LIMIT
    ) {
      guard += 1;
      const sets = buildCandidateSets({
        project: input.project,
        candidates,
        stage,
        strictGroups: input.strictGroups,
        entryIds,
        dayEntriesLength: dayEntries.length,
        dayUsedMinutes,
        budgetMinutes: input.budgetMinutes,
        maxParallel: input.maxParallel,
        isPracticalMode: input.isPracticalMode,
        dailyBookMode: input.dailyBookMode,
        priorityScore,
      }).filter((set) =>
        set.members.every((member) => !entryIds.has(member.state.id)),
      );
      const nextSet = sets.find(
        (set) => dayEntries.length + set.members.length <= input.maxParallel,
      );
      if (!nextSet) break;
      let allocated = false;
      nextSet.members.forEach((member) => {
        allocated =
          allocateTo(member.state, member.step, false, stage) || allocated;
      });
      if (!allocated) break;
    }
  };

  allocateActualOverrides();
  fillStage(input.strictCandidates, 'strict');
  if (entryIds.size < input.maxParallel) {
    latestBackfillCandidates = input.recomputeBackfillCandidates([...entryIds]);
    fillStage(latestBackfillCandidates, 'backfill');
  }
  if (entryIds.size < input.maxParallel) {
    latestPrereqCandidates = input.recomputePrereqCandidates();
    fillStage(latestPrereqCandidates, 'prereq');
  }

  if (
    input.project.constraints.boostUnused !== false &&
    dayEntries.length &&
    dayUsedMinutes <
      input.budgetMinutes - DAY_PLAN_ACTIVE_BUDGET_EPSILON_MINUTES
  ) {
    let boostGuard = 0;
    while (
      dayUsedMinutes <
        input.budgetMinutes - DAY_PLAN_ACTIVE_BUDGET_EPSILON_MINUTES &&
      boostGuard < DAY_PLAN_ALLOCATION_GUARD_LIMIT
    ) {
      boostGuard += 1;
      const booster = chooseBoostCandidate({
        entryStates,
        entryMap,
        budgetLeft: input.budgetMinutes - dayUsedMinutes,
        project: input.project,
        isPracticalMode: input.isPracticalMode,
        priorityScore,
      });
      if (!booster) break;
      allocateTo(
        booster.state,
        booster.step,
        true,
        booster.state.startPolicy || 'strict',
      );
    }
  }

  return {
    dayEntries,
    entryMap,
    dayUsedMinutes,
    backfillCandidates: latestBackfillCandidates,
    prereqCandidates: latestPrereqCandidates,
  };
}
