import { computePlannerSnapshot } from '../core/engine';
import { plannerClock } from '../core/time';
import type { Clock, PlannerProjectV1 } from '../core/types';

interface WorkerComputeMessage {
  type: 'compute';
  requestId: number;
  project: PlannerProjectV1;
  nowIso: string;
}

function workerClock(nowIso: string): Clock {
  return {
    ...plannerClock,
    now(): Date {
      return new Date(nowIso);
    },
    timelineStart(project: PlannerProjectV1): Date {
      const startDateKey = project.constraints.sd || nowIso.slice(0, 10);
      return new Date(`${startDateKey}T12:00:00Z`);
    },
  };
}

self.onmessage = (event: MessageEvent<WorkerComputeMessage>): void => {
  if (event.data.type !== 'compute') return;
  try {
    const snapshot = computePlannerSnapshot(event.data.project, {
      clock: workerClock(event.data.nowIso),
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
