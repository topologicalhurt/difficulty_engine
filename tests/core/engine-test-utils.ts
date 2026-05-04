import { createPlannerEngine } from '../../src/core/engine';
import { plannerClock } from '../../src/core/time';
import type { EngineSnapshot, Logger, PlannerProjectV1 } from '../../src/core/types';

export const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

export function computeSnapshot(project: PlannerProjectV1): EngineSnapshot {
  return createPlannerEngine({ clock: plannerClock, logger: silentLogger }).computeSnapshot(project);
}
