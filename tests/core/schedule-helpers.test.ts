import { describe, expect, it } from 'vitest';

import { coStudyComponents } from '../../src/core/schedule-components';
import { descendantMap } from '../../src/core/schedule-graph';
import { groupBooks } from '../../src/core/schedule-group-summary';
import type { SchedulePlanItem } from '../../src/core/types';

function scheduleItem(
  id: string,
  displayGroup: string,
  ds: number,
  difficulty: number,
): SchedulePlanItem {
  return {
    id,
    title: id,
    short: id,
    displayGroup,
    authors: [],
    pages: 10,
    scheduleDifficulty: difficulty,
    displayDifficulty: difficulty,
    baseDays: 1,
    plannedDays: 1,
    requestedDays: 1,
    dayPages: 10,
    dayMins: 10,
    hours: 1,
    strictMinPg: 1,
    effectiveMinPg: 1,
    floorRelaxed: false,
    absolutePageTarget: 10,
    relativePageTarget: 10,
    relativePacingPercentile: 50,
    pacingPageTarget: 10,
    floorPolicy: 'strict',
    manual: {},
    manualOverride: false,
    manualHardWindow: false,
    manualStartLocked: false,
    manualDaysLocked: false,
    manualWindowImpossibleReason: null,
    depth: 0,
    prereqs: [],
    allowPrereqOverlap: false,
    completed: false,
    scheduleRank: 0,
    windowMinDays: 1,
    windowMaxDays: 1,
    lane: 0,
    laneEnforced: false,
    releaseSlot: ds,
    targetWindow: { start: ds, end: ds + 1 },
    targetWindowStart: ds,
    targetWindowEnd: ds + 1,
    coStudyGroup: null,
    ds,
    de: ds + 1,
    wks: 1,
    mutualBatchIndex: 0,
    coStudyGroupSize: 1,
    lanePrevId: null,
  };
}

describe('schedule helper modules', () => {
  it('builds deterministic co-study connected components', () => {
    const components = coStudyComponents(
      ['d', 'a', 'c', 'b'],
      [
        ['a', 'b'],
        ['c', 'd'],
        ['b', 'c'],
      ],
    );

    expect(components).toEqual([['a', 'b', 'c', 'd']]);
  });

  it('builds transitive descendant maps from prerequisite parents', () => {
    const descendants = descendantMap(['a', 'b', 'c', 'd'], {
      a: [],
      b: ['a'],
      c: ['b'],
      d: ['a'],
    });

    expect([...descendants.a].sort()).toEqual(['b', 'c', 'd']);
    expect([...descendants.b]).toEqual(['c']);
    expect([...descendants.c]).toEqual([]);
  });

  it('groups scheduled books by display group with stable in-group ordering', () => {
    const grouped = groupBooks([
      scheduleItem('late', 'Core', 3, 2),
      scheduleItem('hard', 'Core', 1, 8),
      scheduleItem('easy', 'Core', 1, 3),
      scheduleItem('solo', 'Applied', 0, 4),
    ]);

    expect(grouped.Applied.map((item) => item.id)).toEqual(['solo']);
    expect(grouped.Core.map((item) => item.id)).toEqual([
      'easy',
      'hard',
      'late',
    ]);
  });
});
