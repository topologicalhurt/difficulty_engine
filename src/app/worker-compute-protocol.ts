import { plannerClock } from '../core/time';
import type { Clock, PlannerProjectV1 } from '../core/types';
import { isoTimestamp } from '../infra/cache-time';

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
    nowIso: isoTimestamp(() => clock.now().getTime()),
    timelineStartIso: isoTimestamp(() =>
      clock.timelineStart(project).getTime(),
    ),
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
