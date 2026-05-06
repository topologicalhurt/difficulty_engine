import { describe, expect, it } from 'vitest';

import { buildCandidateSets } from '../../src/core/day-plan-candidates';
import {
  DEFAULT_CONSTRAINTS,
  createDefaultAiRecommendationSettings,
  createDefaultSourceSettings,
} from '../../src/core/defaults';
import type { PlanningState } from '../../src/core/internal-types';
import type { PlannerProjectV1 } from '../../src/core/types';

function project(): PlannerProjectV1 {
  return {
    version: 1,
    library: { books: {} },
    manualOverrides: { schedule: {}, deferred: {}, actuals: {} },
    constraints: {
      ...DEFAULT_CONSTRAINTS,
      feasibilityMode: 'strict_floor',
      minPg: 5,
      maxPg: 5,
    },
    aiRecommendationSettings: createDefaultAiRecommendationSettings(),
    sourceSettings: createDefaultSourceSettings(),
    enrichmentCache: {},
    uiPreferences: {
      ganttView: 'plan',
      ganttZoom: 1,
      planColorMode: 'category_mono',
    },
  };
}

function planningState(
  id: string,
  mppRead: number,
  priority: number,
): PlanningState {
  return {
    id,
    short: id,
    title: id,
    displayGroup: 'Test',
    lane: 0,
    eff: 5,
    displayEff: 5,
    pages: 5,
    manual: false,
    manualStartLocked: false,
    manualHardWindow: false,
    manualDaysLocked: false,
    manualWindowImpossibleReason: null,
    prereqs: [],
    allowPrereqOverlap: false,
    scheduleRank: priority,
    lanePrevId: null,
    laneEnforced: false,
    coStudyGroup: null,
    releaseSlot: 0,
    targetDe: 0,
    plannedDays: 1,
    strictMinPg: 5,
    effectiveMinPg: 5,
    floorRelaxed: false,
    floorPolicy: 'strict',
    totalTenths: 50,
    remainingTenths: 50,
    readRemainTenths: 50,
    skimRemainTenths: 0,
    readTotalTenths: 50,
    skimTotalTenths: 0,
    mppRead,
    skimRatio: 0.35,
    targetHrs: 0,
    targetDayPages: 5,
    overlapReasons: [],
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
    planDays: 1,
    minFeasibleDays: 1,
    maxFeasibleDays: 1,
    strictMinTenths: 50,
    minTenths: 50,
    maxTenths: 50,
    maxTenthsFeasible: 50,
    backfilled: false,
    prereqOverlapUsed: false,
    startPolicy: null,
    hardInfeasible: false,
    relaxationReason: null,
  };
}

describe('buildCandidateSets', () => {
  it('finds lower-priority feasible starters after the scan frontier', () => {
    const expensive = Array.from({ length: 40 }, (_, index) =>
      planningState(`expensive-${index}`, 20, 100 - index),
    );
    const cheap = planningState('cheap-fit', 5, 1);

    const sets = buildCandidateSets({
      project: project(),
      candidates: [...expensive, cheap],
      stage: 'strict',
      strictGroups: {},
      entryIds: new Set(),
      dayEntriesLength: 0,
      dayUsedMinutes: 0,
      budgetMinutes: 60,
      maxParallel: 1,
      isPracticalMode: false,
      dailyBookMode: 'interspersed',
      priorityScore: (state) => state.scheduleRank,
    });

    expect(sets[0]?.members.map((member) => member.state.id)).toEqual([
      'cheap-fit',
    ]);
  });
});
