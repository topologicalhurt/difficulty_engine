import { describe, expect, it } from 'vitest';

import {
  selectLibraryViewModel,
  selectReadingListViewModel,
} from '../../src/app/selectors/library';
import { selectPlanViewModel } from '../../src/app/selectors/plan';
import {
  selectBookProgress,
  selectOverallProgress,
  selectProgressSummary,
} from '../../src/app/selectors/progress';
import { makeBook, makeProject, makeStore } from './store-test-utils';

function progressStore() {
  return makeStore({
    initialProject: makeProject({
      books: {
        a: makeBook({
          id: 'a',
          title: 'Alpha',
          pages: 100,
          planOrder: 0,
          enrichment: {
            chapters: ['Start', 'End'],
            description: 'Fixture book for progress tests.',
            olSubjects: ['fixture'],
            tocSource: 'manual',
          },
        }),
        b: makeBook({
          id: 'b',
          title: 'Beta',
          pages: 50,
          planOrder: 1,
          enrichment: {
            chapters: ['Start', 'End'],
            description: 'Fixture book for progress tests.',
            olSubjects: ['fixture'],
            tocSource: 'manual',
          },
        }),
      },
      constraints: {
        sd: '2026-01-05',
        par: 1,
        hpd: 4,
        minPg: 5,
        maxPg: 30,
        bookOrderPolicy: 'enforce',
      },
    }),
  });
}

describe('progress selectors', () => {
  it('counts done calendar entries as progress without counting future planned work', () => {
    const store = progressStore();
    const entry = store.selectors.getSnapshot().dayPlan.byBook.a[0];
    expect(entry).toBeTruthy();
    const plannedPages =
      Math.round((entry.readPages + entry.skimPages) * 10) / 10;

    expect(selectBookProgress(store.selectors.getState(), 'a').readPages).toBe(
      0,
    );

    store.commands.markCalendarEntryDone(entry.dateStr, 'a', true);
    const progress = selectBookProgress(store.selectors.getState(), 'a');

    expect(progress.readPages).toBe(plannedPages);
    expect(progress.percent).toBeGreaterThan(0);
    expect(progress.status).toBe('in_progress');
  });

  it('keeps logged progress attached when the plan start date moves', () => {
    const store = progressStore();
    const entry = store.selectors.getSnapshot().dayPlan.byBook.a[0];
    expect(entry).toBeTruthy();
    const plannedPages =
      Math.round((entry.readPages + entry.skimPages) * 10) / 10;

    store.commands.markCalendarEntryDone(entry.dateStr, 'a', true);
    store.commands.updateConstraint('sd', '2026-01-12');

    const state = store.selectors.getState();
    const shiftedEntry = state.snapshot.dayPlan.byDate['2026-01-12']?.find(
      (candidate) => candidate.bookId === 'a',
    );

    expect(
      state.project.manualOverrides.actuals[entry.dateStr]?.a?.pages,
    ).toBe(plannedPages);
    expect(state.project.manualOverrides.actuals['2026-01-12']).toBeUndefined();
    expect(selectBookProgress(state, 'a').readPages).toBe(plannedPages);
    expect(shiftedEntry?.actualOverride).not.toBe(true);
  });

  it('uses logged actual pages and completed books for overall progress', () => {
    const store = progressStore();
    const entry = store.selectors.getSnapshot().dayPlan.byBook.a[0];

    store.commands.setCalendarEntryPages(entry.dateStr, 'a', 12.5);
    store.commands.updateBook('b', { completed: true });

    const alpha = selectBookProgress(store.selectors.getState(), 'a');
    const beta = selectBookProgress(store.selectors.getState(), 'b');
    const overall = selectOverallProgress(store.selectors.getState());

    expect(alpha.readPages).toBe(12.5);
    expect(beta.percent).toBe(100);
    expect(overall.readPages).toBe(62.5);
    expect(overall.totalPages).toBe(150);
    expect(overall.completeBooks).toBe(1);
    expect(overall.inProgressBooks).toBe(1);
  });

  it('projects individual and overall progress from one shared summary', () => {
    const store = progressStore();
    const entry = store.selectors.getSnapshot().dayPlan.byBook.a[0];
    store.commands.setCalendarEntryPages(entry.dateStr, 'a', 12.5);

    const state = store.selectors.getState();
    const summary = selectProgressSummary(state);

    expect(summary.byBook.a.readPages).toBe(
      selectBookProgress(state, 'a').readPages,
    );
    expect(summary.overall.readPages).toBe(selectOverallProgress(state).readPages);
  });

  it('projects progress into library and plan view models', () => {
    const store = progressStore();
    const entry = store.selectors.getSnapshot().dayPlan.byBook.a[0];

    store.commands.setCalendarEntryPages(entry.dateStr, 'a', 10);
    store.commands.selectBook('a');

    const listItem = selectReadingListViewModel(
      store.selectors.getState(),
    ).find((item) => item.id === 'a');
    const library = selectLibraryViewModel(store.selectors.getState());
    const plan = selectPlanViewModel(store.selectors.getState());

    expect(listItem?.progress.readPages).toBe(10);
    expect(library.editor.progress?.readPages).toBe(10);
    expect(plan.inspector.progress?.readPages).toBe(10);
    expect(
      plan.stats.some(
        (item) => item.label === 'Overall progress' && item.value !== '0%',
      ),
    ).toBe(true);
  });
});
