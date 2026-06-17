import { describe, expect, it } from 'vitest';

import { selectActiveTabRenderKeys } from '../../src/app/selectors/active-tab-render-keys';
import { makeStore } from './store-test-utils';

describe('active tab render keys', () => {
  it('keys the calendar tab on every slice the calendar view-model memo reads', () => {
    const store = makeStore();
    store.commands.setActiveView('calendar');
    const state = store.selectors.getState();
    const keys = selectActiveTabRenderKeys(state);

    // scheduleStats + constraints drive the export finish date/summary and
    // actuals drives the per-block performance indicator. If any are missing
    // here, a command that mutates them without recomputing dayPlan would let
    // the host serve a stale calendar.
    expect(keys).toContain(state.snapshot.scheduleStats);
    expect(keys).toContain(state.project.constraints);
    expect(keys).toContain(state.project.manualOverrides.actuals);
  });
});
