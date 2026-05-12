import { describe, expect, it } from 'vitest';

import { makeBook, makeProject, makeStore } from './store-test-utils';

describe('autopilot proposal flow', () => {
  it('proposes before mutating and applies confidence-first settings', () => {
    const initialProject = makeProject({
      books: {
        a: makeBook({
          id: 'a',
          title: 'Autopilot A',
          manualPrereqs: [],
        }),
        b: makeBook({
          id: 'b',
          title: 'Autopilot B',
          manualPrereqs: ['a'],
        }),
      },
      projectPatch: {
        manualOverrides: {
          schedule: { b: { ds: 2, days: 4 } },
          deferred: {},
          actuals: {
            '2026-01-06': { a: { pages: 10, minutes: 45, done: true } },
          },
        },
      },
    });
    const store = makeStore({ initialProject });

    store.commands.solveProjectForMe();

    expect(store.selectors.getProject().constraints.learnerProfileMode).toBe(
      initialProject.constraints.learnerProfileMode,
    );
    expect(store.selectors.getState().ui.autopilotProposal?.mode).toBe(
      'confidence_first',
    );

    store.commands.applyAutopilotProposal();
    const applied = store.selectors.getProject();

    expect(applied.constraints.learnerProfileMode).toBe('confidence_builder');
    expect(applied.readingScopeSettings?.defaultMode).toBe('skip_non_core');
    expect(applied.manualOverrides).toEqual(initialProject.manualOverrides);
    expect(store.selectors.getState().ui.autopilotProposal).toBeNull();
  });
});
