import { createDefaultReadingScopeSettings } from './defaults';
import type { PlannerProjectV1, ReadingScopeSettings } from './types';

export function readingScopeSettingsForProject(
  project: PlannerProjectV1,
): ReadingScopeSettings {
  return project.readingScopeSettings ?? createDefaultReadingScopeSettings();
}
