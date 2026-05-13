import { createPlannerStore } from './store';
import { createPlannerEngine } from '../core/engine';
import { createEmptyProject, normalizeProject } from '../core/project-file';
import type {
  AppState,
  Logger,
  MountPlannerAppOptions,
  PersistenceAdapter,
  PlannerAppHandle,
  PlannerProjectV1,
} from '../core/types';
import { createAiRecommendationClient } from '../infra/ai-recommendation-client';
import AppShell from '../ui/svelte/AppShell.svelte';
import { mount as mountSvelte, unmount as unmountSvelte } from 'svelte';
import { writable } from 'svelte/store';
import { countVisibleDomNodes, readPerformanceNowMs } from './performance';
import {
  createSyncComputeAdapter,
  createWorkerComputeAdapter,
} from './compute-adapter';
import { selectorMetricSnapshot } from './selectors/memo';

type ScheduledRender =
  | {
      kind: 'animation-frame';
      id: number;
      fallbackId: ReturnType<typeof globalThis.setTimeout>;
    }
  | { kind: 'timeout'; id: ReturnType<typeof globalThis.setTimeout> };

async function resolveInitialProject(
  options: MountPlannerAppOptions,
): Promise<PlannerProjectV1> {
  if (options.initialProject) {
    return options.initialProject;
  }
  if (!options.persistence) {
    return createEmptyProject();
  }
  try {
    const loaded = await options.persistence.load();
    return loaded
      ? normalizeProject(loaded as unknown as Record<string, unknown>)
      : createEmptyProject();
  } catch (error) {
    options.logger.warn('planner.persistence.load-failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return createEmptyProject();
  }
}

export interface ProjectSaveQueue {
  enqueue(project: PlannerProjectV1): void;
  flush(): Promise<void>;
}

export function createProjectSaveQueue(
  persistence: PersistenceAdapter,
  logger: Logger,
): ProjectSaveQueue {
  let pendingProject: PlannerProjectV1 | null = null;
  let runPromise: Promise<void> | null = null;

  async function save(project: PlannerProjectV1): Promise<void> {
    try {
      await persistence.save(project);
    } catch (error) {
      logger.warn('planner.persistence.save-failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function start(): Promise<void> {
    runPromise ??= (async () => {
      try {
        while (pendingProject) {
          const project = pendingProject;
          pendingProject = null;
          await save(project);
        }
      } finally {
        runPromise = null;
        if (pendingProject) void start();
      }
    })();
    return runPromise;
  }

  return {
    enqueue(project: PlannerProjectV1): void {
      pendingProject = project;
      void start();
    },
    async flush(): Promise<void> {
      while (pendingProject || runPromise) {
        await start();
      }
    },
  };
}

export async function mountPlannerApp(
  options: MountPlannerAppOptions,
): Promise<PlannerAppHandle> {
  const initialProject = await resolveInitialProject(options);
  const engine = createPlannerEngine({
    clock: options.clock,
    logger: options.logger,
  });
  const workerThresholdBooks = options.performance?.workerThresholdBooks ?? 200;
  const computeAdapter =
    options.computeMode === 'sync'
      ? createSyncComputeAdapter(engine)
      : createWorkerComputeAdapter({
          engine,
          clock: options.clock,
          logger: options.logger,
          forceWorker: options.computeMode === 'worker',
          workerThresholdBooks,
        });
  const store = createPlannerStore({
    initialProject,
    engine,
    computeAdapter,
    enrichmentProvider: options.enrichmentProvider,
    aiRecommendationProvider:
      options.aiRecommendationProvider ??
      createAiRecommendationClient({
        logger: options.logger,
      }),
    localSettings: options.localSettings,
    qbittorrentService: options.qbittorrentService,
    logger: options.logger,
    clock: options.clock,
    debugUi: options.debugUi ?? false,
  });

  const host = document.createElement('div');
  host.className = 'difficulty-engine-app';
  options.container.replaceChildren(host);

  let latestState = store.selectors.getState();
  const appState = writable<AppState>(latestState);
  const shell = mountSvelte(AppShell, {
    target: host,
    props: { appState, store },
  });
  let pendingRender: ScheduledRender | null = null;
  let mounted = true;
  const saveQueue = options.persistence
    ? createProjectSaveQueue(options.persistence, options.logger)
    : null;

  function scheduleRender(callback: () => void): ScheduledRender {
    if (typeof globalThis.requestAnimationFrame === 'function') {
      let flushed = false;
      const flushOnce = (): void => {
        if (flushed) return;
        flushed = true;
        callback();
      };
      return {
        kind: 'animation-frame',
        id: globalThis.requestAnimationFrame(flushOnce),
        fallbackId: globalThis.setTimeout(flushOnce, 50),
      };
    }
    return {
      kind: 'timeout',
      id: globalThis.setTimeout(callback, 0),
    };
  }

  function cancelRender(render: ScheduledRender): void {
    if (render.kind === 'animation-frame') {
      globalThis.cancelAnimationFrame(render.id);
      globalThis.clearTimeout(render.fallbackId);
      return;
    }
    globalThis.clearTimeout(render.id);
  }

  function flushRender(): void {
    pendingRender = null;
    if (!mounted) return;
    const renderStartedAt = readPerformanceNowMs();
    try {
      appState.set(latestState);
      const renderMs = readPerformanceNowMs() - renderStartedAt;
      if (
        options.performance?.collectMetrics ||
        options.onPerformanceSample
      ) {
        const selectorMs = Object.values(selectorMetricSnapshot()).reduce(
          (sum, item) => sum + item.lastMs,
          0,
        );
        options.onPerformanceSample?.({
          bookCount: Object.keys(latestState.project.library.books).length,
          relationCount: latestState.snapshot.relations.length,
          visibleDomNodes: countVisibleDomNodes(host),
          snapshotMs: latestState.performance.lastSnapshotMs,
          selectorMs,
          renderMs,
          workerMs: latestState.performance.lastWorkerMs,
          longTaskCount: 0,
          timestamp: options.clock.now().getTime(),
        });
      }
    } catch (error) {
      options.logger.error('planner.render.failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const unsubscribeState = store.subscriptions.subscribe((state) => {
    latestState = state;
    pendingRender ??= scheduleRender(flushRender);
  });
  const unsubscribeEvents = store.subscriptions.subscribeEvents((event) => {
    if (event.type === 'project-changed' && saveQueue) {
      saveQueue.enqueue(event.project);
    }
    if (event.type === 'blocking-warning-raised') {
      options.logger.warn('planner.blocking-warning', event.payload);
    }
  });

  return {
    store,
    async unmount(): Promise<void> {
      mounted = false;
      if (pendingRender) cancelRender(pendingRender);
      unsubscribeState();
      unsubscribeEvents();
      if (saveQueue) await saveQueue.flush();
      await unmountSvelte(shell);
      computeAdapter.destroy?.();
      options.container.replaceChildren();
    },
  };
}
