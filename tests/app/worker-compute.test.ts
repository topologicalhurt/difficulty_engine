import { describe, expect, it, vi } from 'vitest';

import { createPlannerStore } from '../../src/app/store';
import {
  buildWorkerComputeMessage,
  clockFromWorkerMessage,
} from '../../src/app/worker-compute-protocol';
import { createPlannerEngine } from '../../src/core/engine';
import { plannerClock } from '../../src/core/time';
import type {
  Clock,
  EngineSnapshot,
  PlannerComputeAdapter,
  PlannerProjectV1,
} from '../../src/core/types';
import {
  makeProject,
  makeTestEnrichmentProvider,
  silentLogger,
} from './store-test-utils';

function flushMicrotasks(): Promise<void> {
  return Promise.resolve().then(() => undefined);
}

describe('worker compute integration', () => {
  it('serializes the normalized timeline start instead of deriving it from UTC now', () => {
    const project = makeProject({ constraints: { sd: '' } });
    const clock: Clock = {
      ...plannerClock,
      now: () => new Date('2026-05-06T16:30:00.000Z'),
      timelineStart: () => new Date('2026-05-07T12:00:00.000Z'),
    };

    const message = buildWorkerComputeMessage(3, project, clock);
    const workerSideClock = clockFromWorkerMessage(message);

    expect(message.nowIso).toBe('2026-05-06T16:30:00.000Z');
    expect(message.timelineStartIso).toBe('2026-05-07T12:00:00.000Z');
    expect(workerSideClock.timelineStart(project).toISOString()).toBe(
      '2026-05-07T12:00:00.000Z',
    );
  });

  it('commits and emits project changes before worker snapshots resolve', () => {
    const engine = createPlannerEngine({
      clock: plannerClock,
      logger: silentLogger,
    });
    const pending: Array<{
      project: PlannerProjectV1;
      resolve(snapshot: EngineSnapshot): void;
    }> = [];
    const computeAdapter: PlannerComputeAdapter = {
      mode: 'worker',
      compute: vi.fn(
        (project) =>
          new Promise<EngineSnapshot>((resolve) => {
            pending.push({ project, resolve });
          }),
      ),
      cancelCurrent: vi.fn(),
    };
    const store = createPlannerStore({
      initialProject: makeProject(),
      engine,
      computeAdapter,
      enrichmentProvider: makeTestEnrichmentProvider(),
      logger: silentLogger,
      clock: plannerClock,
    });
    const events: string[] = [];
    store.subscriptions.subscribeEvents((event) => events.push(event.type));

    store.commands.updateConstraint('hpd', 2);

    expect(pending).toHaveLength(1);
    expect(store.selectors.getProject().constraints.hpd).toBe(2);
    expect(JSON.parse(store.exportProject()).constraints.hpd).toBe(2);
    expect(events).toEqual(['project-changed']);
  });

  it('ignores stale worker snapshot responses', async () => {
    const engine = createPlannerEngine({
      clock: plannerClock,
      logger: silentLogger,
    });
    const pending: Array<{
      project: PlannerProjectV1;
      resolve(snapshot: EngineSnapshot): void;
    }> = [];
    const computeAdapter: PlannerComputeAdapter = {
      mode: 'worker',
      compute: vi.fn(
        (project) =>
          new Promise<EngineSnapshot>((resolve) => {
            pending.push({ project, resolve });
          }),
      ),
      cancelCurrent: vi.fn(),
    };
    const store = createPlannerStore({
      initialProject: makeProject(),
      engine,
      computeAdapter,
      enrichmentProvider: makeTestEnrichmentProvider(),
      logger: silentLogger,
      clock: plannerClock,
    });

    store.commands.updateConstraint('hpd', 2);
    store.commands.updateConstraint('hpd', 4);
    expect(pending).toHaveLength(2);

    pending[0]?.resolve(engine.computeSnapshot(pending[0].project));
    await flushMicrotasks();
    expect(store.selectors.getProject().constraints.hpd).not.toBe(2);

    pending[1]?.resolve(engine.computeSnapshot(pending[1].project));
    await flushMicrotasks();
    expect(store.selectors.getProject().constraints.hpd).toBe(4);
  });

  it('keeps newer UI state when a worker snapshot resolves', async () => {
    const engine = createPlannerEngine({
      clock: plannerClock,
      logger: silentLogger,
    });
    const pending: Array<{
      project: PlannerProjectV1;
      resolve(snapshot: EngineSnapshot): void;
    }> = [];
    const computeAdapter: PlannerComputeAdapter = {
      mode: 'worker',
      compute: vi.fn(
        (project) =>
          new Promise<EngineSnapshot>((resolve) => {
            pending.push({ project, resolve });
          }),
      ),
      cancelCurrent: vi.fn(),
    };
    const store = createPlannerStore({
      initialProject: makeProject(),
      engine,
      computeAdapter,
      enrichmentProvider: makeTestEnrichmentProvider(),
      logger: silentLogger,
      clock: plannerClock,
    });

    store.commands.updateConstraint('hpd', 2);
    store.commands.setActiveView('graphs');
    pending[0]?.resolve(engine.computeSnapshot(pending[0].project));
    await flushMicrotasks();

    expect(store.selectors.getState().ui.activeView).toBe('graphs');
  });
});
