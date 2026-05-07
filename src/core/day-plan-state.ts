import { minutesPerPage, pageBounds } from './constraints';
import { totalHoursFallback } from './day-plan-work';
import type {
  DayPlanSnapshot,
  OverlapCluster,
  PlanningState,
} from './internal-types';
import type { PlannerProjectV1, SchedulePlan } from './types';
import { clamp, round1, safeNumber } from './utils';

export function buildOverlapMap(
  project: PlannerProjectV1,
  clusters: OverlapCluster[],
): DayPlanSnapshot['overlapMap'] {
  const overlapMap: DayPlanSnapshot['overlapMap'] = {};
  if (project.constraints.applyOverlapSkim === false) return overlapMap;
  clusters.forEach((cluster) => {
    cluster.pruning.forEach((prune) => {
      if (!overlapMap[prune.bookId]) {
        overlapMap[prune.bookId] = { skimFrac: 0, timeSaved: 0, reasons: [] };
      }
      const current = overlapMap[prune.bookId];
      current.skimFrac =
        1 -
        (1 - current.skimFrac) *
          (1 - clamp(prune.overlapFrac * prune.prereqPenalty, 0, 0.92));
      current.timeSaved += prune.timeSaved || 0;
      if (prune.reason) current.reasons.push(prune.reason);
    });
  });
  return overlapMap;
}

export function buildPlanningStates(
  project: PlannerProjectV1,
  schedulePlan: SchedulePlan,
  overlapMap: DayPlanSnapshot['overlapMap'],
): PlanningState[] {
  return [...schedulePlan.items]
    .sort(
      (left, right) =>
        left.ds - right.ds ||
        left.lane - right.lane ||
        left.short.localeCompare(right.short),
    )
    .map((item) => {
      const overlap = overlapMap[item.id] || {
        skimFrac: 0,
        timeSaved: 0,
        reasons: [],
      };
      const totalTenths = Math.max(0, Math.round(item.pages * 10));
      const skimTenths = clamp(
        Math.round(totalTenths * clamp(overlap.skimFrac || 0, 0, 0.92)),
        0,
        totalTenths,
      );
      const readTenths = totalTenths - skimTenths;
      const strictMinPg =
        item.strictMinPg || pageBounds(project.constraints).minPg;
      const effectiveMinPg =
        item.effectiveMinPg || item.strictMinPg || strictMinPg;
      return {
        id: item.id,
        short: item.short,
        title: item.title,
        displayGroup: item.displayGroup,
        lane: item.lane,
        eff: item.scheduleDifficulty,
        displayEff: item.displayDifficulty,
        pages: item.pages,
        manual: item.manualOverride,
        manualStartLocked: item.manualStartLocked,
        manualHardWindow: item.manualHardWindow,
        manualDaysLocked: item.manualDaysLocked,
        manualWindowImpossibleReason: item.manualWindowImpossibleReason,
        prereqs: [...item.prereqs],
        allowPrereqOverlap: item.allowPrereqOverlap,
        scheduleRank: item.scheduleRank,
        lanePrevId: item.lanePrevId,
        laneEnforced: item.laneEnforced,
        coStudyGroup: item.coStudyGroup,
        releaseSlot: Math.max(0, Math.round(item.ds || 0)),
        targetDe: Math.max(0, Math.round(item.de || 0)),
        plannedDays: Math.max(1, Math.round(item.plannedDays || 1)),
        strictMinPg,
        effectiveMinPg,
        floorRelaxed: item.floorRelaxed,
        floorPolicy: item.floorPolicy,
        totalTenths,
        remainingTenths: totalTenths,
        readRemainTenths: readTenths,
        skimRemainTenths: skimTenths,
        readTotalTenths: readTenths,
        skimTotalTenths: skimTenths,
        mppRead: minutesPerPage(item.scheduleDifficulty, project.constraints),
        skimRatio: clamp(safeNumber(project.constraints.skimRatio, 0.35), 0, 1),
        targetHrs:
          item.hours ||
          totalHoursFallback(
            item.pages,
            item.scheduleDifficulty,
            project,
            minutesPerPage,
          ),
        targetDayPages: item.dayPages,
        desiredPagesPerDay: item.desiredPagesPerDay,
        feasibleMinPagesPerDay: item.feasibleMinPagesPerDay,
        feasibleMaxPagesPerDay: item.feasibleMaxPagesPerDay,
        finalPagesPerDay: item.finalPagesPerDay,
        pacingBindingReason: item.pacingBindingReason,
        overlapReasons: overlap.reasons || [],
        usedMinutes: 0,
        usedTenths: 0,
        usedDays: 0,
        peakTenths: 0,
        actualStart: null,
        actualEnd: null,
        boostedDays: 0,
        unfinishedTenths: 0,
        infeasibleReason: null,
        blockedReason: null,
        planDays: 0,
        minFeasibleDays: 0,
        maxFeasibleDays: 0,
        strictMinTenths: 0,
        minTenths: 0,
        maxTenths: 0,
        maxTenthsFeasible: 0,
        backfilled: false,
        prereqOverlapUsed: false,
        startPolicy: null,
        hardInfeasible: false,
        relaxationReason: item.floorRelaxed
          ? `${round1(strictMinPg)} pg/day relaxed to ${round1(effectiveMinPg)} pg/day to preserve feasibility.`
          : null,
      };
    });
}
