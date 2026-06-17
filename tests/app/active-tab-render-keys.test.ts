import { describe, expect, it } from 'vitest';

import { selectActiveTabRenderKeys } from '../../src/app/selectors/active-tab-render-keys';
import { calendarViewModelKeys } from '../../src/app/selectors/calendar';
import { makeStore } from './store-test-utils';

describe('active tab render keys', () => {
  it('keys the calendar tab on exactly the calendar view-model key set', () => {
    const store = makeStore();
    store.commands.setActiveView('calendar');
    const state = store.selectors.getState();
    const keys = selectActiveTabRenderKeys(state);

    // The render gate must be the active-view discriminant followed by the
    // view-model's own key set — element-for-element, by reference — so the two
    // can never drift. (A missing slice would serve a stale calendar after a
    // recompute-free command that mutates only that slice.)
    const expected = calendarViewModelKeys(state);
    expect(keys).toHaveLength(expected.length + 1);
    expected.forEach((value, index) => {
      expect(keys[index + 1]).toBe(value);
    });

    // The specific slices that motivated the fix.
    expect(keys).toContain(state.snapshot.scheduleStats);
    expect(keys).toContain(state.project.constraints);
    expect(keys).toContain(state.project.manualOverrides.actuals);
  });
});
