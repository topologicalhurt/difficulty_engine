import { buildMetadataWarnings } from './render-warning-metadata';
import { buildScheduleWarnings } from './render-warning-schedule';
import type { EngineSnapshot, PlannerProjectV1, WarningItem } from './types';

export function buildRenderWarnings(
  project: PlannerProjectV1,
  snapshot: Omit<EngineSnapshot, 'renderModel' | 'diagnostics'>,
): WarningItem[] {
  return [
    ...buildScheduleWarnings(project, snapshot),
    ...buildMetadataWarnings(project, snapshot),
  ];
}
