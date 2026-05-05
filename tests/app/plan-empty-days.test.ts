import { describe, expect, it } from 'vitest';

import { selectPlanViewModel } from '../../src/app/selectors/plan';
import { createPlannerStore } from '../../src/app/store';
import {
  DEFAULT_CONSTRAINTS,
  EXAMPLE_BOOK,
  createDefaultAiRecommendationSettings,
  createDefaultSourceSettings,
} from '../../src/core/defaults';
import { createPlannerEngine } from '../../src/core/engine';
import { parseProject } from '../../src/core/project-file';
import { plannerClock } from '../../src/core/time';
import type {
  BookRecord,
  EngineSnapshot,
  EnrichmentProvider,
  Logger,
  PlannerEngine,
  PlannerProjectV1,
} from '../../src/core/types';

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const enrichmentProvider: EnrichmentProvider = {
  fetchBook: async ({ book }) => ({
    cacheKey: book.id,
    bookPatch: {},
    enrichment: book.enrichment,
    provenance: [],
  }),
  searchBooks: async () => ({
    results: [],
    hasMore: false,
    nextOffset: 0,
    mode: 'search',
  }),
};

function engine(): PlannerEngine {
  return createPlannerEngine({ clock: plannerClock, logger: silentLogger });
}

function contiguousMissingDates(snapshot: EngineSnapshot): string[] {
  const dates = Object.keys(snapshot.dayPlan.byDate).sort();
  const missing: string[] = [];
  for (let index = 1; index < dates.length; index += 1) {
    const prev = new Date(`${dates[index - 1]}T12:00:00Z`);
    const current = new Date(`${dates[index]}T12:00:00Z`);
    for (
      prev.setUTCDate(prev.getUTCDate() + 1);
      prev < current;
      prev.setUTCDate(prev.getUTCDate() + 1)
    ) {
      missing.push(prev.toISOString().slice(0, 10));
    }
  }
  return missing;
}

function book(id: string, patch: Partial<BookRecord> = {}): BookRecord {
  return {
    ...EXAMPLE_BOOK,
    ...patch,
    id,
    title: patch.title ?? id,
    short: patch.short ?? patch.title ?? id,
    subjects: patch.subjects ?? [`${id} topic`],
    enrichment: {
      ...EXAMPLE_BOOK.enrichment,
      chapters: [`${id} chapter`],
      description: `${id} material`,
      olSubjects: [`${id} topic`],
      tocSource: 'manual',
      ...patch.enrichment,
    },
  };
}

function parallelConflictFixture(): PlannerProjectV1 {
  return parseProject(
    JSON.stringify({
      version: 1,
      library: {
        books: {
          a: book('a', {
            title: 'Alpha Systems',
            pages: 80,
            manualSeedDifficulty: 8,
            lockDiff: true,
          }),
          b: book('b', {
            title: 'Beta Systems',
            pages: 80,
            manualSeedDifficulty: 8,
            lockDiff: true,
          }),
          c: book('c', {
            title: 'Gamma Systems',
            pages: 80,
            manualSeedDifficulty: 8,
            lockDiff: true,
          }),
          d: book('d', {
            title: 'Delta Systems',
            pages: 80,
            manualSeedDifficulty: 8,
            lockDiff: true,
          }),
        },
      },
      manualOverrides: { schedule: {}, deferred: {}, actuals: {} },
      constraints: {
        ...DEFAULT_CONSTRAINTS,
        sd: '2026-05-01',
        par: 3,
        hpd: 5,
        dpw: 7,
        studyWeekdays: [0, 1, 2, 3, 4, 5, 6],
        weekdaysCustom: true,
        minPg: 5,
        maxPg: 20,
        feasibilityMode: 'strict_floor',
        backfillMode: 'global',
        prereqMode: 'strict',
        schedAlgo: 'fastest',
        boostUnused: true,
        applyOverlapSkim: false,
      },
      enrichmentCache: {},
      uiPreferences: {
        ganttView: 'plan',
        ganttZoom: 1,
        planColorMode: 'category_mono',
      },
    }),
  );
}

describe('plan empty-day and parallel-fill projection', () => {
  it('labels fixture calendar padding as outside the plan instead of no-study days', () => {
    const project = parallelConflictFixture();
    const store = createPlannerStore({
      initialProject: project,
      engine: engine(),
      enrichmentProvider,
      logger: silentLogger,
      clock: plannerClock,
    });
    const snapshot = store.selectors.getSnapshot();

    expect(contiguousMissingDates(snapshot)).toEqual([]);
    expect(snapshot.scheduleStats.emptyStudyDays).toBe(0);

    const emptyCells = selectPlanViewModel(store.selectors.getState())
      .calendarWeeks.flatMap((week) => week.days)
      .filter(
        (day) => day.entries.length === 0 && day.missedEntries.length === 0,
      );

    expect(emptyCells.length).toBeGreaterThan(0);
    expect(emptyCells.every((day) => day.status === 'outside_plan')).toBe(true);
    expect(new Set(emptyCells.map((day) => day.statusLabel))).toEqual(
      new Set(['Before plan', 'After finish']),
    );
  });

  it('reports strict floor math when parallel slots cannot all fit', () => {
    const snapshot = engine().computeSnapshot(parallelConflictFixture());

    expect(snapshot.scheduleStats.unfilledParallelSlots).toBeGreaterThan(0);
    expect(snapshot.scheduleStats.parallelFitBlockedDays).toBeGreaterThan(0);
    expect(snapshot.scheduleStats.floorViolations).toBe(0);
    expect(
      snapshot.renderModel.warnings.some(
        (warning) => warning.code === 'strict-parallel-floor-conflict',
      ),
    ).toBe(true);
    expect(
      snapshot.renderModel.warnings
        .map((warning) => warning.message)
        .join('\n'),
    ).not.toContain('only 7 book(s) were startable');
  });

  it('projects calendar cell ordering and summaries in the selector', () => {
    const store = createPlannerStore({
      initialProject: parallelConflictFixture(),
      engine: engine(),
      enrichmentProvider,
      logger: silentLogger,
      clock: plannerClock,
    });
    const plannedDay = selectPlanViewModel(store.selectors.getState())
      .calendarWeeks.flatMap((week) => week.days)
      .find((day) => day.entries.length > 1);

    expect(plannedDay).toBeTruthy();
    expect(plannedDay?.plannedMinutes).toBe(
      plannedDay?.entries.reduce((sum, entry) => sum + entry.mins, 0),
    );
    expect(plannedDay?.entrySummary).toBe(
      `${plannedDay?.entries.length} books · ${Math.round(plannedDay?.plannedMinutes ?? 0)}m`,
    );
    expect(plannedDay?.sortedEntries.map((entry) => entry.bookId)).toEqual(
      plannedDay?.entries
        .slice()
        .sort(
          (left, right) =>
            left.lane - right.lane || left.short.localeCompare(right.short),
        )
        .map((entry) => entry.bookId),
    );
  });

  it('records explained empty study days when preserving release gaps', () => {
    const project: PlannerProjectV1 = {
      version: 1,
      library: { books: { delayed: book('delayed', { pages: 80 }) } },
      manualOverrides: {
        schedule: { delayed: { ds: 4 } },
        deferred: {},
        actuals: {},
      },
      constraints: {
        ...DEFAULT_CONSTRAINTS,
        sd: '2026-01-05',
        dpw: 7,
        studyWeekdays: [0, 1, 2, 3, 4, 5, 6],
        weekdaysCustom: true,
        emptyDayPolicy: 'preserve_schedule_gaps',
        hpd: 3,
        minPg: 5,
        maxPg: 20,
      },
      aiRecommendationSettings: createDefaultAiRecommendationSettings(),
      enrichmentCache: {},
      sourceSettings: createDefaultSourceSettings(),
      uiPreferences: {
        ganttView: 'plan',
        ganttZoom: 1,
        planColorMode: 'category_mono',
      },
    };

    const snapshot = engine().computeSnapshot(project);

    expect(snapshot.scheduleStats.emptyStudyDays).toBe(4);
    expect(snapshot.dayPlan.startability.emptyStudyDays).toHaveLength(4);
    expect(
      snapshot.dayPlan.startability.emptyStudyDays.every(
        (day) => day.reason === 'waiting_for_release',
      ),
    ).toBe(true);
  });
});
