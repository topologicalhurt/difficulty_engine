import type { DayPlanSnapshot, PlanningState } from './internal-types';
import type { PlannerProjectV1 } from './types';

export function buildDayPlanBookStats(
  project: PlannerProjectV1,
  states: PlanningState[],
  stateById: Record<string, PlanningState>,
): DayPlanSnapshot['byBookStats'] {
  const byBookStats: DayPlanSnapshot['byBookStats'] = {};
  states.forEach((state) => {
    state.unfinishedTenths = state.remainingTenths;
    byBookStats[state.id] = {
      id: state.id,
      targetStart: state.releaseSlot,
      targetEnd: state.targetDe,
      actualStart: state.actualStart,
      actualEnd: state.actualEnd,
      actualWks:
        state.actualStart == null || state.actualEnd == null
          ? 0
          : (state.actualEnd - state.actualStart) /
            Math.max(1, project.constraints.dpw),
      usedDays: state.usedDays,
      minutes: state.usedMinutes,
      remainingMinutes: Math.max(
        0,
        (state.readRemainTenths / 10) * state.mppRead +
          (state.skimRemainTenths / 10) *
            state.mppRead *
            (state.skimRatio || 0.35),
      ),
      dayPages: state.usedDays ? state.usedTenths / 10 / state.usedDays : 0,
      peakDayPages: state.peakTenths / 10,
      boostedDays: state.boostedDays,
      unfinishedPages: state.unfinishedTenths / 10,
      infeasibleReason: state.infeasibleReason,
      hardInfeasible: Boolean(state.hardInfeasible),
      blockedReason: state.blockedReason,
      plannedStudyDays: state.planDays,
      minFeasibleDays: state.minFeasibleDays,
      maxFeasibleDays: state.maxFeasibleDays,
      overlapReasons: [...state.overlapReasons],
      strictMinPg: state.strictMinPg,
      effectiveMinPg: state.effectiveMinPg,
      floorRelaxed: Boolean(state.floorRelaxed),
      relaxationReason: state.relaxationReason,
      backfilled: Boolean(state.backfilled),
      prereqOverlapUsed: Boolean(state.prereqOverlapUsed),
      releaseFidelity:
        state.actualStart == null
          ? true
          : state.actualStart >= state.releaseSlot,
      laneFidelity:
        !state.laneEnforced ||
        !state.lanePrevId ||
        stateById[state.lanePrevId]?.actualEnd == null ||
        state.actualStart == null
          ? true
          : state.actualStart >= (stateById[state.lanePrevId]?.actualEnd || 0),
    };
  });
  return byBookStats;
}
