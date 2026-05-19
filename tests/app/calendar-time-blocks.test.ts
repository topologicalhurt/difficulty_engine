import { describe, expect, it } from 'vitest';

import { makeStore } from './store-test-utils';

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
  it('persists hourly study blocks without recomputing the plan', () => {
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
      startMinute: 13 * 60,
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
      weeklyMinutes: 240,
      sessionsPerWeek: 2,
    });

    const activity = Object.values(
      store.selectors.getProject().manualOverrides.calendarActivities ?? {},
    )[0];
    expect(activity).toMatchObject({
      title: 'Repairs',
      color: '#ff8800',
      mode: 'fixed_weekly',
      days: [2, 4],
    });
    expect(store.selectors.getSnapshot()).toBe(snapshotBefore);

    store.commands.removeCalendarActivity(activity.id);
    expect(
      store.selectors.getProject().manualOverrides.calendarActivities,
    ).toEqual({});
  });
});
