import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CONSTRAINTS,
  createDefaultAiRecommendationSettings,
  createDefaultSourceSettings,
} from '../../src/core/defaults';
import type { BookRecord, PlannerProjectV1 } from '../../src/core/types';
import { computeSnapshot } from './engine-test-utils';

function book(
  id: string,
  title: string,
  seed: number,
  pages: number,
  subjects: string[],
): BookRecord {
  return {
    id,
    title,
    short: title,
    authors: ['Fixture Author'],
    displayGroup: id === 'intro' ? 'Core' : 'Applied',
    manualSeedDifficulty: seed,
    pages,
    subjects,
    publisher: '',
    isbn: null,
    year: null,
    manualPrereqs: [],
    manualCoStudy: [],
    owned: true,
    planOrder: id.charCodeAt(0),
    allowPrereqOverlap: false,
    lockDiff: false,
    noPropOut: false,
    ignored: false,
    constantRD: false,
    completed: false,
    enrichment: {
      chapters: ['Intro', title],
      description: subjects.join(' '),
      olSubjects: subjects,
      tocSource: 'manual',
    },
  };
}

function project(): PlannerProjectV1 {
  return {
    version: 1,
    library: {
      books: {
        intro: book('intro', 'Intro', 5, 220, ['linear algebra', 'vectors']),
        advanced: book('advanced', 'Advanced', 5.2, 420, [
          'linear algebra',
          'optimization',
        ]),
      },
    },
    manualOverrides: { schedule: {}, deferred: {}, actuals: {} },
    constraints: { ...DEFAULT_CONSTRAINTS, sd: '2026-01-05', par: 1 },
    aiRecommendationSettings: createDefaultAiRecommendationSettings(),
    enrichmentCache: {},
    sourceSettings: createDefaultSourceSettings(),
    uiPreferences: {
      ganttView: 'plan',
      ganttZoom: 1,
      planColorMode: 'category_mono',
    },
  };
}

function targetSpread(values: number[]): number {
  return Math.max(...values) - Math.min(...values);
}

function average(values: number[]): number {
  return (
    values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
  );
}

describe('page floors and relative pacing', () => {
  it('defaults to strict page floors and reports time-budget conflicts', () => {
    const input = project();
    input.constraints = {
      ...input.constraints,
      feasibilityMode: 'strict_floor',
      hpd: 0.5,
      minPg: 10,
      maxPg: 30,
      bmp: 6,
    };

    const snapshot = computeSnapshot(input);
    const blocked = Object.values(snapshot.dayPlan.byBookStats).filter(
      (stat) => stat.hardInfeasible,
    );

    expect(blocked.length).toBeGreaterThan(0);
    expect(blocked[0].infeasibleReason).toContain('10 pg/day floor');
    expect(
      snapshot.renderModel.warnings.some(
        (warning) => warning.code === 'strict-floor-infeasible',
      ),
    ).toBe(true);
  });

  it('relaxes page floors only in relaxed recommendation mode', () => {
    const input = project();
    input.constraints = {
      ...input.constraints,
      feasibilityMode: 'practical',
      hpd: 1,
      minPg: 80,
      maxPg: 100,
      bmp: 1,
    };

    const snapshot = computeSnapshot(input);

    expect(snapshot.scheduleStats.floorRelaxedBooks).toBeGreaterThan(0);
    expect(snapshot.scheduleStats.hardInfeasibleBooks).toBe(0);
    expect(
      Object.values(snapshot.dayPlan.byBookStats).some(
        (stat) => stat.effectiveMinPg < stat.strictMinPg,
      ),
    ).toBe(true);
  });

  it('stretches page targets across the list when relative pacing is high', () => {
    const absolute = project();
    absolute.constraints = {
      ...absolute.constraints,
      relativePacingStrength: 0,
      hpd: 8,
      minPg: 5,
      maxPg: 25,
      bmp: 1,
      gam: 1,
      applyOverlapSkim: false,
      boostUnused: false,
    };
    const relative = {
      ...absolute,
      constraints: { ...absolute.constraints, relativePacingStrength: 100 },
    };

    const absoluteTargets = computeSnapshot(absolute).schedulePlan.items.map(
      (item) => item.pacingPageTarget,
    );
    const relativeTargets = computeSnapshot(relative).schedulePlan.items.map(
      (item) => item.pacingPageTarget,
    );

    expect(targetSpread(relativeTargets)).toBeGreaterThan(
      targetSpread(absoluteTargets),
    );
  });

  it('raises relaxed-mode page targets when the recommended minimum rises', () => {
    const lowFloor = project();
    lowFloor.constraints = {
      ...lowFloor.constraints,
      feasibilityMode: 'practical',
      relativePacingStrength: 100,
      hpd: 8,
      minPg: 5,
      maxPg: 40,
      bmp: 1,
      gam: 1,
      boostUnused: false,
    };
    const highFloor = {
      ...lowFloor,
      constraints: { ...lowFloor.constraints, minPg: 25 },
    };

    const lowTargets = computeSnapshot(lowFloor).schedulePlan.items.map(
      (item) => item.pacingPageTarget,
    );
    const highTargets = computeSnapshot(highFloor).schedulePlan.items.map(
      (item) => item.pacingPageTarget,
    );

    expect(average(highTargets)).toBeGreaterThan(average(lowTargets));
  });

  it('allows different relative pacing curves to shape mid-ranked books differently', () => {
    const linear = project();
    linear.library.books.middle = book('middle', 'Middle', 5.1, 300, [
      'middle topic',
    ]);
    linear.constraints = {
      ...linear.constraints,
      relativePacingStrength: 100,
      relativePacingCurve: 'linear',
      hpd: 8,
      minPg: 5,
      maxPg: 40,
      bmp: 1,
      gam: 1,
      boostUnused: false,
    };
    const power: PlannerProjectV1 = {
      ...linear,
      constraints: {
        ...linear.constraints,
        relativePacingCurve: 'power' as const,
      },
    };

    const linearMiddle =
      computeSnapshot(linear).schedulePlan.byId.middle.pacingPageTarget;
    const powerMiddle =
      computeSnapshot(power).schedulePlan.byId.middle.pacingPageTarget;

    expect(powerMiddle).toBeGreaterThan(linearMiddle);
  });

  it('keeps strict-mode daily chunks anchored to the solved target after boost changes remaining work', () => {
    const input = project();
    input.constraints = {
      ...input.constraints,
      feasibilityMode: 'strict_floor',
      relativePacingStrength: 100,
      hpd: 10,
      minPg: 7,
      maxPg: 32,
      bmp: 1,
      gam: 1,
      boostUnused: true,
      boostStrength: 0.5,
      applyOverlapSkim: false,
    };

    const snapshot = computeSnapshot(input);
    const item = snapshot.schedulePlan.byId.intro;
    const entries = snapshot.dayPlan.byBook.intro ?? [];
    const chunks = entries
      .slice(1, -1)
      .map((entry) => entry.readPages + entry.skimPages);

    expect(item.pacingPageTarget).toBeGreaterThan(input.constraints.minPg);
    expect(chunks.length).toBeGreaterThan(0);
    expect(Math.min(...chunks)).toBeGreaterThan(input.constraints.minPg + 1);
  });

  it('keeps the same started books in daily cohort mode until slots open', () => {
    const input = project();
    input.library.books = {
      a: book('a', 'A Started', 2, 50, ['alpha']),
      b: book('b', 'B Started', 2, 50, ['beta']),
      c: book('c', 'C Later Hard', 9, 50, ['gamma']),
      d: book('d', 'D Later Hard', 9, 50, ['delta']),
    };
    input.manualOverrides.schedule = { c: { ds: 1 }, d: { ds: 1 } };
    input.constraints = {
      ...input.constraints,
      dailyBookMode: 'daily_cohort',
      schedAlgo: 'greedy',
      feasibilityMode: 'strict_floor',
      par: 2,
      hpd: 8,
      minPg: 10,
      maxPg: 10,
      bmp: 1,
      gam: 1,
      boostUnused: false,
      applyOverlapSkim: false,
    };

    const snapshot = computeSnapshot(input);
    const rotating = computeSnapshot({
      ...input,
      constraints: { ...input.constraints, dailyBookMode: 'interspersed' },
    });
    const days = Object.keys(snapshot.dayPlan.byDate).sort();
    const rotatingDays = Object.keys(rotating.dayPlan.byDate).sort();
    const firstDayIds = snapshot.dayPlan.byDate[days[0]]
      .map((entry) => entry.bookId)
      .sort();
    const secondDayIds = snapshot.dayPlan.byDate[days[1]]
      .map((entry) => entry.bookId)
      .sort();
    const rotatingSecondDayIds = rotating.dayPlan.byDate[rotatingDays[1]]
      .map((entry) => entry.bookId)
      .sort();

    expect(firstDayIds).toEqual(['a', 'b']);
    expect(secondDayIds).toEqual(['a', 'b']);
    expect(rotatingSecondDayIds).toEqual(['c', 'd']);
  });

  it('explains strict cohort conflicts and stacks only when relaxed floors can fit', () => {
    const input = project();
    input.library.books = {
      a: book('a', 'A', 6.6, 120, ['alpha']),
      b: book('b', 'B', 6.6, 120, ['beta']),
      c: book('c', 'C', 6.6, 120, ['gamma']),
    };
    input.constraints = {
      ...input.constraints,
      dailyBookMode: 'daily_cohort',
      schedAlgo: 'fastest',
      feasibilityMode: 'strict_floor',
      prereqMode: 'strict',
      par: 3,
      hpd: 4.5,
      minPg: 7,
      maxPg: 35,
      bmp: 25,
      gam: 1.5,
      boostUnused: false,
      applyOverlapSkim: false,
      mutualEnabled: false,
      autoRD: false,
    };

    const strict = computeSnapshot(input);
    const relaxed = computeSnapshot({
      ...input,
      constraints: { ...input.constraints, feasibilityMode: 'practical' },
    });
    const strictFirstDate = Object.keys(strict.dayPlan.byDate).sort()[0];
    const relaxedFirstDate = Object.keys(relaxed.dayPlan.byDate).sort()[0];

    expect(strict.dayPlan.byDate[strictFirstDate]).toHaveLength(1);
    expect(
      strict.renderModel.warnings.some(
        (warning) => warning.code === 'strict-parallel-floor-conflict',
      ),
    ).toBe(true);
    expect(relaxed.dayPlan.byDate[relaxedFirstDate]).toHaveLength(3);
  });
});
