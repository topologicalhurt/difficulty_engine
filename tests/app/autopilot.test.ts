import { describe, expect, it } from 'vitest';

import { createPlannerEngine } from '../../src/core/engine';
import { targetEndDateKey } from '../../src/core/planning-window';
import type { PlannerComputeAdapter } from '../../src/core/types';
import { plannerClock } from '../../src/core/time';
import {
  makeBook,
  makeProject,
  makeStore,
  silentLogger,
} from './store-test-utils';

describe('autopilot proposal flow', () => {
  it('proposes before mutating and applies confidence-first settings', async () => {
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
        readingScopeSettings: {
          defaultMode: 'include_all',
          skipKinds: [],
        },
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
    const originalProject = store.selectors.getProject();

    store.commands.updateAutopilotDraft({ settingsPolicy: 'fresh_optimal' });
    await store.commands.solveProjectForMe();

    expect(store.selectors.getProject().constraints.learnerProfileMode).toBe(
      initialProject.constraints.learnerProfileMode,
    );
    expect(store.selectors.getState().ui.autopilotProposal?.mode).toBe(
      'confidence_first',
    );
    expect(
      store.selectors.getState().ui.autopilotProposal?.optimization.proofStatus,
    ).toMatch(/^(optimal|infeasible)$/);
    expect(
      store.selectors.getState().ui.autopilotProposal?.optimization
        .paretoAlternatives.length,
    ).toBeGreaterThan(0);

    const events: string[] = [];
    const unsubscribe = store.subscriptions.subscribeEvents((event) => {
      events.push(event.type);
    });
    store.commands.applyAutopilotProposal();
    unsubscribe();
    const applied = store.selectors.getProject();

    expect(applied.constraints.learnerProfileMode).not.toBe(
      originalProject.constraints.learnerProfileMode,
    );
    expect(applied.readingScopeSettings).toEqual(
      originalProject.readingScopeSettings,
    );
    expect(applied.library).toEqual(originalProject.library);
    expect(applied.manualOverrides).toEqual(originalProject.manualOverrides);
    expect(events).toContain('project-changed');
    expect(store.exportProject()).toContain('"constraints"');
    expect(store.selectors.getState().ui.autopilotProposal).toBeNull();
  });

  it('proves optimality over the bounded portfolio for a feasible simple plan', async () => {
    const store = makeStore({
      initialProject: makeProject({
        books: {
          a: makeBook({ id: 'a', title: 'Autopilot A', pages: 30 }),
        },
        constraints: {
          minPg: 1,
          maxPg: 40,
          hpd: 4,
          par: 1,
          feasibilityMode: 'practical',
        },
      }),
    });

    await store.commands.solveProjectForMe();

    expect(
      store.selectors.getState().ui.autopilotProposal?.optimization.proofStatus,
    ).toBe('optimal');
  });

  it('uses wizard answers as optimization parameters before generating', async () => {
    const store = makeStore({
      initialProject: makeProject({
        books: {
          a: makeBook({ id: 'a', title: 'Autopilot A' }),
          b: makeBook({ id: 'b', title: 'Autopilot B' }),
        },
      }),
    });

    store.commands.updateAutopilotDraft({
      goal: 'deadline_first',
      deadlinePolicy: 'strict',
      targetEndDate: '2027-03-01',
      hardParallelCap: 1,
      dailyHours: 3,
      floorPolicy: 'strict_floor',
    });
    await store.commands.solveProjectForMe();

    const proposal = store.selectors.getState().ui.autopilotProposal;
    expect(proposal?.wizard.goal).toBe('deadline_first');
    expect(proposal?.wizard.deadlinePolicy).toBe('strict');
    expect(proposal?.constraintPatch.par).toBe(1);
    expect(proposal?.constraintPatch.hpd).toBe(3);
    expect(proposal?.optimizationInput.hardConstraints).toContain(
      'requested automatic parallel cap starts at <= 1',
    );
  });

  it('can solve from scratch instead of preserving current planner knobs', async () => {
    const store = makeStore({
      initialProject: makeProject({
        constraints: {
          propLiftCap: 9,
          compressExp: 3,
          autoRD: true,
          hpd: 2,
          par: 2,
        },
      }),
    });

    store.commands.updateAutopilotDraft({
      settingsPolicy: 'fresh_optimal',
      dailyHours: 2,
      hardParallelCap: 2,
    });
    await store.commands.solveProjectForMe();

    const proposal = store.selectors.getState().ui.autopilotProposal;
    expect(proposal?.wizard.settingsPolicy).toBe('fresh_optimal');
    expect(proposal?.constraintPatch.propLiftCap).not.toBe(9);
    expect(proposal?.constraintPatch.compressExp).not.toBe(3);
    expect(proposal?.constraintPatch.autoRD).toBe(false);
  });

  it('preserves current planner knobs when requested', async () => {
    const store = makeStore({
      initialProject: makeProject({
        constraints: {
          propLiftCap: 9,
          compressExp: 3,
          autoRD: true,
          hpd: 2,
          par: 2,
        },
      }),
    });

    store.commands.updateAutopilotDraft({
      settingsPolicy: 'respect_current',
      dailyHours: 2,
      hardParallelCap: 2,
    });
    await store.commands.solveProjectForMe();

    const proposal = store.selectors.getState().ui.autopilotProposal;
    expect(proposal?.wizard.settingsPolicy).toBe('respect_current');
    expect(proposal?.constraintPatch.propLiftCap).toBeUndefined();
    expect(proposal?.constraintPatch.compressExp).toBeUndefined();
    expect(proposal?.constraintPatch.autoRD).toBeUndefined();
  });

  it('recovers a known completion date from overconstrained inputs', async () => {
    const store = makeStore({
      initialProject: makeProject({
        books: {
          a: makeBook({ id: 'a', title: 'Autopilot A', pages: 600 }),
        },
        constraints: {
          hpd: 3,
          par: 2,
          minPg: 80,
          feasibilityMode: 'strict_floor',
        },
      }),
    });

    store.commands.updateAutopilotDraft({
      deadlinePolicy: 'strict',
      targetEndDate: '2026-01-06',
      hardParallelCap: 1,
      dailyHours: 0.25,
      floorPolicy: 'strict_floor',
    });
    await store.commands.solveProjectForMe();

    const proposal = store.selectors.getState().ui.autopilotProposal;
    expect(proposal?.optimization.status).toBe('ready');
    expect(proposal?.optimization.proofStatus).toBe('feasible_with_gap');
    expect(proposal?.optimization.recommendedPlan.finishDate).toBeTruthy();
    expect(
      proposal?.optimization.recommendedPlan.relaxationReasons.length,
    ).toBeGreaterThan(0);
    store.commands.applyAutopilotProposal();

    const state = store.selectors.getState();
    expect(state.snapshot.scheduleStats.finishDate).toBeTruthy();
    expect(state.ui.autopilotProposal).toBeNull();
    expect(state.ui.banner?.tone).toBe('success');
  });

  it('prefers a useful completion date over a tiny ineffective relaxation', async () => {
    const store = makeStore({
      initialProject: makeProject({
        books: {
          a: makeBook({ id: 'a', title: 'Long Autopilot A', pages: 500 }),
        },
        constraints: {
          hpd: 0.5,
          par: 1,
          minPg: 1,
          maxPg: 1,
          feasibilityMode: 'practical',
        },
      }),
    });
    const currentSpanWeeks =
      store.selectors.getState().snapshot.scheduleStats.spanWeeks;

    store.commands.updateAutopilotDraft({
      deadlinePolicy: 'none',
      settingsPolicy: 'respect_current',
      dailyHours: 0.5,
      hardParallelCap: 1,
      floorPolicy: 'practical',
    });
    await store.commands.solveProjectForMe();

    const plan =
      store.selectors.getState().ui.autopilotProposal?.optimization
        .recommendedPlan;
    expect(plan?.finishDate).toBeTruthy();
    expect(plan?.spanWeeks ?? Number.POSITIVE_INFINITY).toBeLessThan(
      currentSpanWeeks / 4,
    );
    expect(plan?.relaxationReasons.length).toBeGreaterThan(0);
  });

  it('derives default wizard values from the loaded project constraints', () => {
    const project = makeProject({
      constraints: {
        sd: '2026-02-10',
        tl: 6,
        hpd: 5,
        par: 4,
      },
    });
    const store = makeStore({ initialProject: project });

    const draft = store.selectors.getState().ui.autopilotDraft;
    expect(draft.dailyHours).toBe(5);
    expect(draft.hardParallelCap).toBe(4);
    expect(draft.targetEndDate).toBe(targetEndDateKey('2026-02-10', 6));
  });

  it('resets wizard defaults when a project is loaded after mount', () => {
    const store = makeStore({
      initialProject: makeProject({
        constraints: { hpd: 2, par: 2, sd: '2026-01-01', tl: 2 },
      }),
    });
    const nextProject = makeProject({
      constraints: { hpd: 6, par: 5, sd: '2026-04-01', tl: 4 },
    });

    store.commands.loadProject(nextProject);

    const draft = store.selectors.getState().ui.autopilotDraft;
    expect(draft.dailyHours).toBe(6);
    expect(draft.hardParallelCap).toBe(5);
    expect(draft.targetEndDate).toBe(targetEndDateKey('2026-04-01', 4));
    expect(store.selectors.getState().ui.autopilotProposal).toBeNull();
  });

  it('uses the worker compute adapter for deferred optimization candidates', async () => {
    const engine = createPlannerEngine({
      clock: plannerClock,
      logger: silentLogger,
    });
    let calls = 0;
    const computeAdapter: PlannerComputeAdapter = {
      mode: 'worker',
      shouldDefer: () => true,
      async compute(project) {
        calls += 1;
        return engine.computeSnapshot(project);
      },
      cancelCurrent: () => undefined,
    };
    const store = makeStore({
      computeAdapter,
      initialProject: makeProject({
        books: {
          a: makeBook({ id: 'a', title: 'Autopilot A' }),
          b: makeBook({ id: 'b', title: 'Autopilot B' }),
        },
      }),
    });

    await store.commands.solveProjectForMe();

    expect(calls).toBeGreaterThan(0);
    expect(store.selectors.getState().ui.autopilotProposal).not.toBeNull();
  });

  it('optimizes and applies only planner settings, not reading scope', async () => {
    const engine = createPlannerEngine({
      clock: plannerClock,
      logger: silentLogger,
    });
    const evaluatedScopeModes: Array<string | undefined> = [];
    const computeAdapter: PlannerComputeAdapter = {
      mode: 'worker',
      shouldDefer: () => true,
      async compute(project) {
        evaluatedScopeModes.push(project.readingScopeSettings?.defaultMode);
        return engine.computeSnapshot(project);
      },
      cancelCurrent: () => undefined,
    };
    const store = makeStore({
      computeAdapter,
      initialProject: makeProject({
        books: {
          a: makeBook({ id: 'a', title: 'Autopilot A' }),
          b: makeBook({ id: 'b', title: 'Autopilot B' }),
        },
        projectPatch: {
          readingScopeSettings: {
            defaultMode: 'include_all',
            skipKinds: [],
          },
        },
      }),
    });
    const originalScopeSettings =
      store.selectors.getProject().readingScopeSettings;

    store.commands.updateAutopilotDraft({ settingsPolicy: 'fresh_optimal' });
    await store.commands.solveProjectForMe();
    store.commands.applyAutopilotProposal();

    expect(evaluatedScopeModes.length).toBeGreaterThan(0);
    expect(new Set(evaluatedScopeModes)).toEqual(new Set(['include_all']));
    expect(store.selectors.getProject().readingScopeSettings).toEqual(
      originalScopeSettings,
    );
  });
});
