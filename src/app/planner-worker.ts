import { computePlannerSnapshot } from '../core/engine';
import {
  clockFromWorkerMessage,
  type WorkerComputeMessage,
} from './worker-compute-protocol';

self.onmessage = (event: MessageEvent<WorkerComputeMessage>): void => {
  if (event.data.type !== 'compute') return;
  try {
    const snapshot = computePlannerSnapshot(event.data.project, {
      clock: clockFromWorkerMessage(event.data),
    });
    self.postMessage({
      type: 'result',
      requestId: event.data.requestId,
      snapshot,
    });
  } catch (error) {
    self.postMessage({
      type: 'error',
      requestId: event.data.requestId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
