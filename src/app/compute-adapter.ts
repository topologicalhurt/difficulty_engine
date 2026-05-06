import type {
  Clock,
  EngineSnapshot,
  Logger,
  PlannerComputeAdapter,
  PlannerEngine,
  PlannerProjectV1,
} from '../core/types';
import { buildWorkerComputeMessage } from './worker-compute-protocol';

declare global {
  interface Window {
    __DIFFICULTY_ENGINE_WORKER_SCRIPT__?: string;
  }
}

interface WorkerResultMessage {
  type: 'result' | 'error';
  requestId: number;
  snapshot?: EngineSnapshot;
  message?: string;
}

class PlannerComputeCancelledError extends Error {
  constructor() {
    super('Planner compute cancelled');
  }
}

export function createSyncComputeAdapter(
  engine: PlannerEngine,
): PlannerComputeAdapter {
  return {
    mode: 'sync',
    shouldDefer(): boolean {
      return false;
    },
    async compute(project: PlannerProjectV1): Promise<EngineSnapshot> {
      return engine.computeSnapshot(project);
    },
    cancelCurrent(): void {},
    destroy(): void {},
  };
}

export function createWorkerComputeAdapter(options: {
  engine: PlannerEngine;
  clock: Clock;
  logger: Logger;
  forceWorker?: boolean;
  workerThresholdBooks?: number;
}): PlannerComputeAdapter {
  const syncAdapter = createSyncComputeAdapter(options.engine);
  const script = globalThis.window?.__DIFFICULTY_ENGINE_WORKER_SCRIPT__;
  if (!script || typeof Worker !== 'function') {
    return syncAdapter;
  }

  let workerUrl = '';
  let worker: Worker;
  try {
    workerUrl = URL.createObjectURL(
      new Blob([script], { type: 'text/javascript' }),
    );
    worker = new Worker(workerUrl);
  } catch (error) {
    if (workerUrl) URL.revokeObjectURL(workerUrl);
    options.logger.warn('planner.worker.unavailable', {
      error: error instanceof Error ? error.message : String(error),
    });
    return syncAdapter;
  }
  let activeRequestId = 0;
  let activeReject: ((reason?: unknown) => void) | null = null;
  const workerThresholdBooks = options.workerThresholdBooks ?? 0;

  function shouldUseWorker(project: PlannerProjectV1): boolean {
    return (
      options.forceWorker === true ||
      Object.keys(project.library.books).length >= workerThresholdBooks
    );
  }

  function cancelCurrent(): void {
    activeRequestId += 1;
    activeReject?.(new PlannerComputeCancelledError());
    activeReject = null;
  }

  return {
    mode: 'worker',
    shouldDefer: shouldUseWorker,
    compute(project: PlannerProjectV1): Promise<EngineSnapshot> {
      if (!shouldUseWorker(project)) {
        return syncAdapter.compute(project);
      }
      cancelCurrent();
      const requestId = activeRequestId;
      const message = buildWorkerComputeMessage(
        requestId,
        project,
        options.clock,
      );

      return new Promise<EngineSnapshot>((resolve, reject) => {
        activeReject = reject;
        worker.onmessage = (event: MessageEvent<WorkerResultMessage>) => {
          if (event.data.requestId !== activeRequestId) return;
          activeReject = null;
          if (event.data.type === 'error' || !event.data.snapshot) {
            reject(new Error(event.data.message ?? 'Planner worker failed'));
            return;
          }
          resolve(event.data.snapshot);
        };
        worker.onerror = (event) => {
          if (requestId !== activeRequestId) return;
          activeReject = null;
          reject(new Error(event.message || 'Planner worker failed'));
        };
        worker.postMessage(message);
      }).catch((error: unknown) => {
        if (error instanceof PlannerComputeCancelledError) {
          throw error;
        }
        options.logger.warn('planner.worker.fallback', {
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          ...options.engine.computeSnapshot(project),
        };
      });
    },
    cancelCurrent,
    destroy(): void {
      cancelCurrent();
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
    },
  };
}
