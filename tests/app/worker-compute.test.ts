import { afterEach, describe, expect, it, vi } from 'vitest';

import { createWorkerComputeAdapter } from '../../src/app/compute-adapter';
import { createPlannerStore } from '../../src/app/store';
import {
  buildWorkerComputeMessage,
  clockFromWorkerMessage,
  type WorkerComputeMessage,
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
  makeBook,
  makeProject,
  makeTestEnrichmentProvider,
  silentLogger,
} from './store-test-utils';

function flushMicrotasks(): Promise<void> {
  return Promise.resolve().then(() => undefined);
}

interface WorkerTestResultEvent {
  data: {
    type: 'result';
    requestId: number;
    snapshot: EngineSnapshot;
  };
}

describe('worker compute integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

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
      shouldDefer: () => true,
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
      shouldDefer: () => true,
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
      shouldDefer: () => true,
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

  it('falls back to sync compute when blob workers are blocked', async () => {
    const engine = createPlannerEngine({
      clock: plannerClock,
      logger: silentLogger,
    });
    vi.stubGlobal('window', {
      __DIFFICULTY_ENGINE_WORKER_SCRIPT__: 'self.onmessage = () => {};',
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:blocked-worker');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          throw new Error('Refused to create worker');
        }
      },
    );

    const adapter = createWorkerComputeAdapter({
      engine,
      clock: plannerClock,
      logger: silentLogger,
      forceWorker: true,
    });
    const snapshot = await adapter.compute(makeProject());

    expect(adapter.mode).toBe('sync');
    expect(snapshot.schedulePlan.items).toHaveLength(1);
  });

  it('selects worker compute after project size crosses the auto threshold', async () => {
    const engine = createPlannerEngine({
      clock: plannerClock,
      logger: silentLogger,
    });
    const postedMessages: WorkerComputeMessage[] = [];
    vi.stubGlobal('window', {
      __DIFFICULTY_ENGINE_WORKER_SCRIPT__: 'self.onmessage = () => {};',
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:planner-worker');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.stubGlobal(
      'Worker',
      class {
        onmessage: ((event: WorkerTestResultEvent) => void) | null = null;
        onerror: ((event: ErrorEvent) => void) | null = null;

        postMessage(message: WorkerComputeMessage): void {
          postedMessages.push(message);
          queueMicrotask(() => {
            this.onmessage?.({
              data: {
                type: 'result',
                requestId: message.requestId,
                snapshot: engine.computeSnapshot(message.project),
              },
            });
          });
        }

        terminate(): void {}
      },
    );
    const adapter = createWorkerComputeAdapter({
      engine,
      clock: plannerClock,
      logger: silentLogger,
      workerThresholdBooks: 2,
    });

    await adapter.compute(makeProject());
    expect(postedMessages).toHaveLength(0);

    await adapter.compute(
      makeProject({
        books: {
          'book-1': makeBook({ id: 'book-1', planOrder: 0 }),
          'book-2': makeBook({
            id: 'book-2',
            title: 'Second Book',
            short: 'Second',
            planOrder: 1,
          }),
        },
      }),
    );

    expect(postedMessages).toHaveLength(1);
    adapter.destroy?.();
  });

  it('keeps below-threshold auto-mode store recomputes synchronous', () => {
    const engine = createPlannerEngine({
      clock: plannerClock,
      logger: silentLogger,
    });
    const postedMessages: WorkerComputeMessage[] = [];
    vi.stubGlobal('window', {
      __DIFFICULTY_ENGINE_WORKER_SCRIPT__: 'self.onmessage = () => {};',
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:planner-worker');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.stubGlobal(
      'Worker',
      class {
        postMessage(message: WorkerComputeMessage): void {
          postedMessages.push(message);
        }

        terminate(): void {}
      },
    );
    const adapter = createWorkerComputeAdapter({
      engine,
      clock: plannerClock,
      logger: silentLogger,
      workerThresholdBooks: 2,
    });
    const store = createPlannerStore({
      initialProject: makeProject(),
      engine,
      computeAdapter: adapter,
      enrichmentProvider: makeTestEnrichmentProvider(),
      logger: silentLogger,
      clock: plannerClock,
    });
    const events: string[] = [];
    store.subscriptions.subscribeEvents((event) => events.push(event.type));

    store.commands.updateConstraint('hpd', 3);

    expect(postedMessages).toHaveLength(0);
    expect(events).toEqual(['project-changed', 'snapshot-updated']);
    expect(store.selectors.getProject().constraints.hpd).toBe(3);
    adapter.destroy?.();
  });

  it('ignores a pending worker result after a newer sync recompute', async () => {
    const engine = createPlannerEngine({
      clock: plannerClock,
      logger: silentLogger,
    });
    let shouldDefer = true;
    const pending: Array<{
      project: PlannerProjectV1;
      resolve(snapshot: EngineSnapshot): void;
    }> = [];
    const computeAdapter: PlannerComputeAdapter = {
      mode: 'worker',
      shouldDefer: () => shouldDefer,
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
    expect(pending).toHaveLength(1);
    shouldDefer = false;
    store.commands.updateConstraint('hpd', 4);
    const snapshotAfterSyncRecompute = store.selectors.getSnapshot();

    pending[0]?.resolve(engine.computeSnapshot(pending[0].project));
    await flushMicrotasks();

    expect(store.selectors.getProject().constraints.hpd).toBe(4);
    expect(store.selectors.getSnapshot()).toBe(snapshotAfterSyncRecompute);
  });

  it('falls back to a sync snapshot when a host worker adapter rejects', async () => {
    const engine = createPlannerEngine({
      clock: plannerClock,
      logger: silentLogger,
    });
    const computeAdapter: PlannerComputeAdapter = {
      mode: 'worker',
      shouldDefer: () => true,
      compute: vi.fn(async () => {
        throw new Error('host worker unavailable');
      }),
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
    const initialSnapshot = store.selectors.getSnapshot();
    const events: string[] = [];
    store.subscriptions.subscribeEvents((event) => events.push(event.type));

    store.commands.updateConstraint('hpd', 4);
    await flushMicrotasks();

    expect(store.selectors.getProject().constraints.hpd).toBe(4);
    expect(store.selectors.getSnapshot()).not.toBe(initialSnapshot);
    expect(events).toEqual(['project-changed', 'snapshot-updated']);
  });
});
