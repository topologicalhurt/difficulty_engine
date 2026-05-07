import { describe, expect, it } from 'vitest';

import {
  createDefaultAiRecommendationSettings,
  createDefaultSourceSettings,
  createDefaultUiPreferences,
  DEFAULT_CONSTRAINTS,
} from '../../src/core/defaults';
import type {
  BookRecord,
  ConstraintSet,
  EngineSnapshot,
  PlannerProjectV1,
} from '../../src/core/types';
import { computeSnapshot } from './engine-test-utils';

function book(index: number, patch: Partial<BookRecord> = {}): BookRecord {
  const id = `book-${index}`;
  return {
    id,
    title: `Technical Book ${index}`,
    short: `Book ${index}`,
    authors: [`Author ${index % 3}`],
    displayGroup: index % 2 ? 'Core' : 'Supporting',
    manualSeedDifficulty: 2 + (index % 7),
    pages: 120 + index * 17,
    subjects: [`topic-${index % 4}`, `cluster-${index % 3}`],
    publisher: '',
    isbn: null,
    year: 2020 + index,
    sourcePath: null,
    documents: [],
    selectedDocumentId: null,
    openLibraryKey: null,
    openLibraryEditionKey: null,
    openLibraryWorkKey: null,
    googleBooksId: null,
    manualPrereqs: index > 1 && index % 4 === 0 ? [`book-${index - 1}`] : [],
    manualCoStudy: [],
    owned: true,
    planOrder: index,
    allowPrereqOverlap: index % 5 === 0,
    lockDiff: false,
    noPropOut: false,
    ignored: false,
    constantRD: false,
    completed: false,
    enrichment: {
      chapters: [`Chapter ${index}.1`, `Chapter ${index}.2`],
      description: `A technical book covering topic ${index % 4}.`,
      olSubjects: [`topic-${index % 4}`],
      tocSource: 'manual',
    },
    ...patch,
  };
}

function project(
  constraints: Partial<ConstraintSet> = {},
  bookPatch: Record<string, Partial<BookRecord>> = {},
): PlannerProjectV1 {
  const books = Object.fromEntries(
    Array.from({ length: 14 }, (_, zeroIndex) => {
      const index = zeroIndex + 1;
      return [`book-${index}`, book(index, bookPatch[`book-${index}`])];
    }),
  );
  books['book-3'].manualCoStudy = ['book-4'];
  books['book-4'].manualCoStudy = ['book-3'];
  return {
    version: 1,
    library: { books },
    manualOverrides: { schedule: {}, deferred: {}, actuals: {} },
    constraints: {
      ...DEFAULT_CONSTRAINTS,
      sd: '2026-01-05',
      ...constraints,
    },
    aiRecommendationSettings: createDefaultAiRecommendationSettings(),
    sourceSettings: createDefaultSourceSettings(),
    enrichmentCache: {},
    uiPreferences: createDefaultUiPreferences(),
  };
}

function expectFiniteNonNegative(value: number, label: string): void {
  expect(Number.isFinite(value), label).toBe(true);
  expect(value, label).toBeGreaterThanOrEqual(0);
}

function scheduleSignature(snapshot: EngineSnapshot): unknown {
  return {
    plan: snapshot.schedulePlan.items.map((item) => ({
      id: item.id,
      ds: item.ds,
      de: item.de,
      lane: item.lane,
      dayPages: item.dayPages,
      finalPagesPerDay: item.finalPagesPerDay,
    })),
    dayPlan: Object.entries(snapshot.dayPlan.byDate).map(([date, entries]) => [
      date,
      entries.map((entry) => ({
        id: entry.bookId,
        mins: entry.mins,
        readPages: entry.readPages,
      })),
    ]),
    stats: {
      finishDate: snapshot.scheduleStats.finishDate?.toISOString() ?? null,
      totalHours: snapshot.scheduleStats.totalHours,
      unfinishedBooks: snapshot.scheduleStats.unfinishedBooks,
      hardInfeasibleBooks: snapshot.scheduleStats.hardInfeasibleBooks,
      blockedBooks: snapshot.scheduleStats.blockedBooks,
    },
  };
}

function assertEngineInvariants(snapshot: EngineSnapshot): void {
  const projectIds = new Set(Object.keys(snapshot.schedulePlan.byId));
  expect(snapshot.schedulePlan.items.map((item) => item.id).sort()).toEqual(
    snapshot.schedulePlan.activeIds.slice().sort(),
  );
  for (const item of snapshot.schedulePlan.items) {
    expect(snapshot.schedulePlan.byId[item.id]).toBe(item);
    expectFiniteNonNegative(item.dayPages, `${item.id} dayPages`);
    expectFiniteNonNegative(
      item.finalPagesPerDay,
      `${item.id} finalPagesPerDay`,
    );
    expect(item.prereqs.every((id) => projectIds.has(id))).toBe(true);
  }

  let unfinishedBooks = 0;
  let hardInfeasibleBooks = 0;
  let blockedBooks = 0;
  for (const stat of Object.values(snapshot.dayPlan.byBookStats)) {
    expect(projectIds.has(stat.id)).toBe(true);
    expectFiniteNonNegative(stat.minutes, `${stat.id} minutes`);
    expectFiniteNonNegative(
      stat.remainingMinutes,
      `${stat.id} remainingMinutes`,
    );
    expectFiniteNonNegative(
      stat.finalPagesPerDay,
      `${stat.id} finalPagesPerDay`,
    );
    expectFiniteNonNegative(stat.unfinishedPages, `${stat.id} unfinishedPages`);
    if (stat.hardInfeasible || stat.infeasibleReason) hardInfeasibleBooks += 1;
    if (stat.unfinishedPages > 0.001) {
      unfinishedBooks += 1;
      expect(
        Boolean(stat.blockedReason || stat.infeasibleReason || stat.hardInfeasible),
        `${stat.id} unfinished without blocker`,
      ).toBe(true);
      if (!stat.hardInfeasible && stat.blockedReason) blockedBooks += 1;
    }
  }
  expect(snapshot.scheduleStats.unfinishedBooks).toBe(unfinishedBooks);
  expect(snapshot.scheduleStats.hardInfeasibleBooks).toBe(
    hardInfeasibleBooks,
  );
  expect(snapshot.scheduleStats.blockedBooks).toBe(blockedBooks);
  if (snapshot.scheduleStats.finishDate) {
    expect(snapshot.scheduleStats.unfinishedBooks).toBe(0);
    expect(snapshot.scheduleStats.hardInfeasibleBooks).toBe(0);
    expect(snapshot.scheduleStats.blockedBooks).toBe(0);
  }

  for (const [date, entries] of Object.entries(snapshot.dayPlan.byDate)) {
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const entry of entries) {
      expect(projectIds.has(entry.bookId)).toBe(true);
      expectFiniteNonNegative(entry.mins, `${date} ${entry.bookId} mins`);
      expectFiniteNonNegative(
        entry.readPages,
        `${date} ${entry.bookId} readPages`,
      );
      expectFiniteNonNegative(
        entry.skimPages,
        `${date} ${entry.bookId} skimPages`,
      );
    }
  }
}

describe('engine invariants', () => {
  it('holds across representative scheduler and feasibility modes', () => {
    const cases: Array<Partial<ConstraintSet>> = [
      { schedAlgo: 'balanced', feasibilityMode: 'strict_floor' },
      { schedAlgo: 'fastest', feasibilityMode: 'strict_floor', par: 4 },
      { schedAlgo: 'greedy', feasibilityMode: 'practical', dailyBookMode: 'daily_cohort' },
      {
        schedAlgo: 'critical',
        feasibilityMode: 'strict_floor',
        emptyDayPolicy: 'preserve_schedule_gaps',
      },
    ];
    for (const constraints of cases) {
      assertEngineInvariants(computeSnapshot(project(constraints)));
    }
  });

  it('keeps display mapping controls out of scheduler truth', () => {
    const base = computeSnapshot(project());
    const displayOnly = computeSnapshot(
      project({
        compressCurve: 'inverse_logistic',
        compressExp: 1.8,
        diffMapMode: 'scaled',
        diffMapMin: 1,
        diffMapMax: 10,
        diffCurveFloorPoint: 0.25,
        diffCurveCeilingPoint: 0.8,
        diffRamp: 2,
      }),
    );
    expect(scheduleSignature(displayOnly)).toEqual(scheduleSignature(base));
  });
});
