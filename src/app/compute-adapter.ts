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
}): PlannerComputeAdapter {
  const script = window.__DIFFICULTY_ENGINE_WORKER_SCRIPT__;
  if (!script || typeof Worker !== 'function') {
    return createSyncComputeAdapter(options.engine);
  }

  const workerUrl = URL.createObjectURL(
    new Blob([script], { type: 'text/javascript' }),
  );
  const worker = new Worker(workerUrl);
  let activeRequestId = 0;
  let activeReject: ((reason?: unknown) => void) | null = null;

  function cancelCurrent(): void {
    activeRequestId += 1;
    activeReject?.(new PlannerComputeCancelledError());
    activeReject = null;
  }

  return {
    mode: 'worker',
    compute(project: PlannerProjectV1): Promise<EngineSnapshot> {
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
