import { describe, expect, it } from 'vitest';

import { selectCalendarViewModel } from '../../src/app/selectors/calendar';
import { makeBook, makeProject, makeStore } from './store-test-utils';

function firstPlannedEntry(store: ReturnType<typeof makeStore>): {
  dateKey: string;
  bookId: string;
} {
  const byDate = store.selectors.getSnapshot().dayPlan.byDate;
  const dateKey = Object.keys(byDate).sort()[0];
  const firstEntry = dateKey ? byDate[dateKey]?.[0] : undefined;
  if (!dateKey || !firstEntry) throw new Error('Expected a planned entry.');
  return { dateKey, bookId: firstEntry.bookId };
}

describe('calendar time block commands', () => {
  it('persists quarter-hour study blocks without recomputing the plan', () => {
    const store = makeStore();
    const { dateKey, bookId } = firstPlannedEntry(store);
    const events: string[] = [];
    store.subscriptions.subscribeEvents((event) => events.push(event.type));
    const snapshotBefore = store.selectors.getSnapshot();

    store.commands.setCalendarTimeBlock(dateKey, bookId, 13 * 60 + 22, 75);

    const state = store.selectors.getState();
    expect(
      state.project.manualOverrides.timeBlocks?.[dateKey]?.[bookId],
    ).toEqual({
      startMinute: 13 * 60 + 15,
      durationMinutes: 75,
    });
    expect(state.snapshot).toBe(snapshotBefore);
    expect(events).toEqual(['project-changed']);
    expect(
      JSON.parse(store.exportProject()).manualOverrides.timeBlocks,
    ).toEqual(state.project.manualOverrides.timeBlocks);
  });

  it('clears persisted hourly study blocks', () => {
    const store = makeStore();
    const { dateKey, bookId } = firstPlannedEntry(store);

    store.commands.setCalendarTimeBlock(dateKey, bookId, 12 * 60, 60);
    store.commands.clearCalendarTimeBlock(dateKey, bookId);

    expect(
      store.selectors.getProject().manualOverrides.timeBlocks?.[dateKey],
    ).toBeUndefined();
  });

  it('persists repeating activities without recomputing the plan', () => {
    const store = makeStore();
    const snapshotBefore = store.selectors.getSnapshot();

    store.commands.addCalendarActivity({
      title: 'Repairs',
      color: '#ff8800',
      mode: 'fixed_weekly',
      days: [2, 4],
      startMinute: 18 * 60,
      durationMinutes: 120,
      dailyDurations: { '2': 180, '4': 120 },
      sessionsPerWeek: 2,
      rotationStepDays: 1,
      rotationIntervalWeeks: 1,
    });

    const activity = Object.values(
      store.selectors.getProject().manualOverrides.calendarActivities ?? {},
    )[0];
    expect(activity).toMatchObject({
      title: 'Repairs',
      color: '#ff8800',
      mode: 'fixed_weekly',
      days: [2, 4],
      dailyDurations: { '2': 180, '4': 120 },
      weeklyMinutes: 300,
      rotationStepDays: 1,
    });
    expect(store.selectors.getSnapshot()).toBe(snapshotBefore);

    store.commands.removeCalendarActivity(activity.id);
    expect(
      store.selectors.getProject().manualOverrides.calendarActivities,
    ).toEqual({});
  });

  it('keeps a pinned study block where the user dropped it instead of letting an auto-placed block evict it', () => {
    const store = makeStore({
      initialProject: makeProject({
        books: {
          'book-1': makeBook({
            id: 'book-1',
            title: 'Alpha',
            short: 'Alpha',
            pages: 120,
          }),
          'book-2': makeBook({
            id: 'book-2',
            title: 'Beta',
            short: 'Beta',
            pages: 120,
          }),
        },
        // Enough daily budget for both books to study in parallel each day.
        constraints: {
          par: 2,
          dailyBookMode: 'daily_cohort',
          hpd: 6,
          minPg: 5,
          bmp: 15,
        },
      }),
    });
    // Find a day where both books study in parallel.
    const before = selectCalendarViewModel(store.selectors.getState());
    const day = before.weeks[0]?.days.find((cell) => cell.blocks.length >= 2);
    if (!day) throw new Error('Expected a day with two parallel study blocks.');
    // The second block (higher lane) is the one an earlier auto-placed block
    // could displace. Pin it to 08:00 — exactly the default focus-window start
    // where the first, unpinned book auto-places.
    const pinnedBookId = day.blocks[1].bookId;
    store.commands.setCalendarTimeBlock(day.key, pinnedBookId, 8 * 60, 60);

    const after = selectCalendarViewModel(store.selectors.getState());
    const pinnedDay = after.weeks[0].days.find((cell) => cell.key === day.key);
    const pinnedBlock = pinnedDay?.blocks.find(
      (block) => block.bookId === pinnedBookId,
    );
    const otherBlock = pinnedDay?.blocks.find(
      (block) => block.bookId !== pinnedBookId,
    );
    // The override is honored; the unpinned book is placed around it.
    expect(pinnedBlock?.startMinute).toBe(8 * 60);
    expect(pinnedBlock?.persisted).toBe(true);
    expect(otherBlock?.startMinute).not.toBe(8 * 60);
  });
});
