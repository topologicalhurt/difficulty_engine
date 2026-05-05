import { describe, expect, it, vi } from 'vitest';

import { selectGraphRenderModel } from '../../src/app/selectors/graph-render-data';
import {
  calendarBadges,
  calendarDetailText,
  selectPlanViewModel,
} from '../../src/app/selectors/plan';
import { CONSTRAINT_FIELDS } from '../../src/core/defaults';
import type {
  ConstraintSet,
  EnrichmentProvider,
  PlannerProjectV1,
  PlannerStore,
  SearchBooksResponse,
} from '../../src/core/types';
import { makeBook, makeProject, makeStore } from './store-test-utils';

const enrichmentProvider: EnrichmentProvider = {
  fetchBook: vi.fn(async ({ book }) => ({
    cacheKey: book.id,
    bookPatch: {
      subjects: [...book.subjects, 'enriched'],
    },
    enrichment: {
      ...book.enrichment,
      chapters: book.enrichment.chapters.length
        ? book.enrichment.chapters
        : ['Start', 'Middle'],
      olSubjects: [...book.enrichment.olSubjects, 'enriched'],
    },
    provenance: [
      {
        provider: 'test',
        fetchedAt: '2026-01-05T00:00:00.000Z',
        confidence: 1,
      },
    ],
  })),
  searchBooks: vi.fn(
    async (): Promise<SearchBooksResponse> => ({
      results: [
        {
          key: 'matrix-search',
          title: 'Matrix Search Book',
          authors: ['Search Author'],
          subtitle: 'Search Author · 2026',
          isbn: '9781234567897',
          year: 2026,
          publisher: 'Search Press',
          subjects: ['matrix'],
          description: 'Matrix search fixture.',
          pages: 220,
        },
      ],
      hasMore: false,
      nextOffset: 1,
      mode: 'search',
    }),
  ),
};

function matrixBook(
  id: string,
  title: string,
  seed: number,
  pages: number,
  subjects: string[],
) {
  return makeBook({
    id,
    title,
    displayGroup: id === 'a' ? 'Core' : 'Applied',
    manualSeedDifficulty: seed,
    pages,
    subjects,
    planOrder: id.charCodeAt(0),
    enrichment: {
      chapters: ['Intro', title],
      description: subjects.join(' '),
      olSubjects: subjects,
      tocSource: 'manual',
    },
  });
}

function matrixProject(): PlannerProjectV1 {
  return makeProject({
    books: {
      a: matrixBook('a', 'Alpha', 3, 120, ['alpha', 'shared']),
      b: {
        ...matrixBook('b', 'Beta', 5, 180, ['beta', 'shared']),
        manualPrereqs: ['a'],
        manualCoStudy: ['c'],
      },
      c: {
        ...matrixBook('c', 'Gamma', 7, 260, ['gamma', 'shared']),
        manualPrereqs: ['a', 'b'],
        manualCoStudy: ['b'],
      },
    },
    constraints: { par: 2 },
  });
}

function matrixStore(): PlannerStore {
  return makeStore({
    initialProject: matrixProject(),
    enrichmentProvider,
  });
}

function expectSnapshotUpdate(store: PlannerStore, action: () => void): void {
  const events: string[] = [];
  const unsubscribe = store.subscriptions.subscribeEvents((event) =>
    events.push(event.type),
  );
  action();
  unsubscribe();
  expect(events).toContain('project-changed');
  expect(events).toContain('snapshot-updated');
}

describe('planner parameter wiring matrix', () => {
  it('recomputes through the canonical snapshot for representative constraint controls', () => {
    const cases: Array<
      [keyof ConstraintSet, ConstraintSet[keyof ConstraintSet]]
    > = [
      ['hpd', 4],
      ['tl', 24],
      ['par', 3],
      ['minPg', 3],
      ['maxPg', 30],
      ['relativePacingStrength', 90],
      ['relativePacingCurve', 'power'],
      ['subjectWorkloadStrength', 90],
      ['diffCurveFloorPoint', 0.2],
      ['diffCurveCeilingPoint', 0.75],
      ['dailyBookMode', 'daily_cohort'],
      ['emptyDayPolicy', 'preserve_schedule_gaps'],
      ['bookOrderPolicy', 'prefer'],
      ['schedAlgo', 'fastest'],
      ['feasibilityMode', 'strict_floor'],
      ['backfillMode', 'lane_preserving'],
      ['prereqMode', 'smart_overlap'],
      ['boostUnused', false],
      ['applyOverlapSkim', false],
      ['mutualEnabled', false],
      ['tr', false],
      ['part', true],
      ['excComp', false],
    ];

    cases.forEach(([key, value]) => {
      const store = matrixStore();
      expectSnapshotUpdate(store, () =>
        store.commands.updateConstraint(key, value as never),
      );
      expect(store.selectors.getProject().constraints[key]).toEqual(value);
    });
  });

  it('classifies every user-facing constraint with explicit effect metadata', () => {
    expect(CONSTRAINT_FIELDS.every((field) => Boolean(field.effect))).toBe(
      true,
    );
    expect(
      CONSTRAINT_FIELDS.filter((field) => field.effect === 'display_only').map(
        (field) => field.key,
      ),
    ).toEqual(
      expect.arrayContaining([
        'compressMode',
        'compressCurve',
        'compressExp',
        'diffMapMode',
        'diffMapMin',
        'diffMapMax',
        'diffRamp',
        'diffCurveFloorPoint',
        'diffCurveCeilingPoint',
      ]),
    );
    expect(CONSTRAINT_FIELDS.find((field) => field.key === 'gam')?.effect).toBe(
      'workload_time',
    );
    expect(CONSTRAINT_FIELDS.find((field) => field.key === 'gam')?.group).toBe(
      'Daily Workload',
    );
  });

  it('keeps plan color mode display-only while updating Gantt and calendar colors', () => {
    const store = matrixStore();
    const beforeSnapshot = store.selectors.getSnapshot();
    const before = selectPlanViewModel(store.selectors.getState());
    store.commands.setPlanColorMode('difficulty_gradient');
    const after = selectPlanViewModel(store.selectors.getState());

    expect(store.selectors.getSnapshot()).toBe(beforeSnapshot);
    expect(store.selectors.getProject().uiPreferences.planColorMode).toBe(
      'difficulty_gradient',
    );
    expect(after.colors.mode).toBe('difficulty_gradient');
    expect(after.colors.byBookId).not.toEqual(before.colors.byBookId);

    store.commands.setPlanColorMode('detected_genre');
    expect(selectPlanViewModel(store.selectors.getState()).colors.mode).toBe(
      'detected_genre',
    );
  });

  it('allows compact overview Gantt zoom values below the previous floor', () => {
    const store = matrixStore();
    store.commands.setGanttZoom(0.2);
    const viewModel = selectPlanViewModel(store.selectors.getState());

    expect(store.selectors.getProject().uiPreferences.ganttZoom).toBe(0.2);
    expect(viewModel.gantt.zoom).toBe(0.2);
  });

  it('keeps calendar log selection UI-only while selecting the inspected book', () => {
    const store = matrixStore();
    const beforeSnapshot = store.selectors.getSnapshot();
    const firstDay = Object.keys(beforeSnapshot.dayPlan.byDate).sort()[0];
    const firstEntry = beforeSnapshot.dayPlan.byDate[firstDay]?.[0];
    if (!firstEntry)
      throw new Error('Expected a calendar entry in the fixture plan.');

    store.commands.selectCalendarEntry(firstDay, firstEntry.bookId);
    const state = store.selectors.getState();
    const viewModel = selectPlanViewModel(state);

    expect(store.selectors.getSnapshot()).toBe(beforeSnapshot);
    expect(state.ui.selectedBookId).toBe(firstEntry.bookId);
    expect(state.ui.selectedCalendarEntry).toEqual({
      dateKey: firstDay,
      bookId: firstEntry.bookId,
    });
    expect(viewModel.selectedCalendarEntry).toEqual({
      dateKey: firstDay,
      bookId: firstEntry.bookId,
    });

    store.commands.selectBook(firstEntry.bookId);
    expect(store.selectors.getState().ui.selectedCalendarEntry).toBeNull();
  });

  it('wires Sunday and seven-day study weeks into the day-plan selector path', () => {
    const store = matrixStore();
    expectSnapshotUpdate(store, () =>
      store.commands.updateConstraint('dpw', 7),
    );
    expect(store.selectors.getProject().constraints.studyWeekdays).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);

    expectSnapshotUpdate(store, () =>
      store.commands.updateConstraints({
        studyWeekdays: [0],
        weekdaysCustom: true,
        dpw: 1,
      }),
    );
    const viewModel = selectPlanViewModel(store.selectors.getState());
    expect(store.selectors.getProject().constraints.studyWeekdays).toEqual([0]);
    expect(
      viewModel.calendarWeeks
        .flatMap((week) => week.days)
        .some((day) => day.dayLabel === 'Sun'),
    ).toBe(true);
  });

  it('projects graph settings through the graph selector instead of stale view state', () => {
    const store = matrixStore();
    store.commands.updateConstraint('tr', true);
    const reducedEdges = selectGraphRenderModel(store.selectors.getState())
      .prerequisiteEdges.length;

    store.commands.updateConstraint('tr', false);
    const fullEdges = selectGraphRenderModel(store.selectors.getState())
      .prerequisiteEdges.length;

    store.commands.updateConstraint('mutualEnabled', false);
    const disabledCoStudy = selectGraphRenderModel(store.selectors.getState())
      .coStudyGroups.length;

    expect(fullEdges).toBeGreaterThan(reducedEdges);
    expect(disabledCoStudy).toBe(0);
  });

  it('wires calendar actuals and deferrals into the same plan projection used by the UI', () => {
    const store = matrixStore();
    const firstDay = Object.keys(
      store.selectors.getSnapshot().dayPlan.byDate,
    ).sort()[0];
    const firstEntry =
      store.selectors.getSnapshot().dayPlan.byDate[firstDay]?.[0];
    expect(firstEntry).toBeTruthy();

    expectSnapshotUpdate(store, () => {
      store.commands.markCalendarEntryDone(firstDay, firstEntry.bookId);
      store.commands.setCalendarEntryMinutes(firstDay, firstEntry.bookId, 95);
      store.commands.setCalendarEntryPages(firstDay, firstEntry.bookId, 6.5);
    });

    let entry = selectPlanViewModel(store.selectors.getState())
      .calendarWeeks.flatMap((week) => week.days)
      .flatMap((day) => day.entries)
      .find((item) => item.bookId === firstEntry.bookId);
    expect(entry?.done).toBe(true);
    expect(entry?.actualMinutes).toBe(95);
    expect(entry?.actualPages).toBe(6.5);
    expect(
      Math.round(((entry?.readPages ?? 0) + (entry?.skimPages ?? 0)) * 10) / 10,
    ).toBe(6.5);

    expectSnapshotUpdate(store, () =>
      store.commands.deferCalendarEntry(firstDay, firstEntry.bookId),
    );
    entry = selectPlanViewModel(store.selectors.getState())
      .calendarWeeks.flatMap((week) => week.days)
      .flatMap((day) => day.entries)
      .find((item) => item.bookId === firstEntry.bookId);
    expect(entry?.done).not.toBe(true);
  });

  it('keeps floor details out of default calendar badges but available in detail text', () => {
    const store = matrixStore();
    store.commands.updateConstraints({
      feasibilityMode: 'practical',
      hpd: 0.5,
      minPg: 20,
      maxPg: 30,
      bmp: 6,
    });
    const entry = Object.values(store.selectors.getSnapshot().dayPlan.byDate)
      .flat()
      .find((item) => item.floorRelaxed);
    expect(entry).toBeTruthy();
    expect(
      calendarBadges(
        entry ??
          Object.values(store.selectors.getSnapshot().dayPlan.byDate).flat()[0],
      ).some((item) => item.label.includes('Floor')),
    ).toBe(false);
    expect(
      calendarDetailText(
        entry ??
          Object.values(store.selectors.getSnapshot().dayPlan.byDate).flat()[0],
      ),
    ).toContain('Floor relaxed');
  });

  it('exposes boost days through compact calendar details', () => {
    const store = matrixStore();
    store.commands.updateConstraints({
      boostUnused: true,
      boostStrength: 1,
      hpd: 8,
      minPg: 2,
      maxPg: 60,
      bmp: 1,
    });
    const boosted = Object.values(store.selectors.getSnapshot().dayPlan.byDate)
      .flat()
      .find((entry) => entry.boosted);

    expect(boosted).toBeTruthy();
    expect(
      calendarDetailText(
        boosted ??
          Object.values(store.selectors.getSnapshot().dayPlan.byDate).flat()[0],
      ),
    ).toContain('Boost day');
  });

  it('keeps search, enrichment, and book metadata wired into library and snapshot outputs', async () => {
    const store = matrixStore();
    store.commands.setBookSearchQuery('matrix');
    await store.commands.searchCatalog();
    const suggestion = store.selectors.getState().ui.bookSearchResults[0];
    store.commands.addBookFromSuggestion(suggestion);
    const added = Object.values(
      store.selectors.getProject().library.books,
    ).find((item) => item.title === 'Matrix Search Book');
    expect(added).toBeTruthy();
    await store.commands.refreshBookEnrichment(added?.id ?? '');

    const project = store.selectors.getProject();
    expect(
      Object.values(project.library.books).some(
        (item) => item.title === 'Matrix Search Book',
      ),
    ).toBe(true);
    expect(project.library.books[added?.id ?? '']?.subjects).toContain(
      'enriched',
    );
    expect(
      store.selectors.getSnapshot().schedulePlan.byId[added?.id ?? ''],
    ).toBeTruthy();
  });
});
