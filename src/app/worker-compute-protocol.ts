import { plannerClock } from '../core/time';
import type { Clock, PlannerProjectV1 } from '../core/types';

export interface WorkerComputeMessage {
  type: 'compute';
  requestId: number;
  project: PlannerProjectV1;
  nowIso: string;
  timelineStartIso: string;
}

export function buildWorkerComputeMessage(
  requestId: number,
  project: PlannerProjectV1,
  clock: Clock,
): WorkerComputeMessage {
  return {
    type: 'compute',
    requestId,
    project,
    nowIso: clock.now().toISOString(),
    timelineStartIso: clock.timelineStart(project).toISOString(),
  };
}

export function clockFromWorkerMessage(message: WorkerComputeMessage): Clock {
  return {
    ...plannerClock,
    now(): Date {
      return new Date(message.nowIso);
    },
    timelineStart(): Date {
      return new Date(message.timelineStartIso);
    },
  };
}
