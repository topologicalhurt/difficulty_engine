import type { PersistenceAdapter, PlannerProjectV1 } from '../core/types';
import { normalizeProject, serializeProject } from '../core/project-file';

const BACKUP_SUFFIX = '.backup';

function parseStoredProject(raw: string | null): PlannerProjectV1 | undefined {
  if (!raw) return undefined;
  try {
    return normalizeProject(JSON.parse(raw) as Record<string, unknown>);
  } catch {
    return undefined;
  }
}

function storage(): Storage | undefined {
  return globalThis.localStorage;
}

export function createLocalStoragePersistence(
  storageKey: string,
): PersistenceAdapter {
  const backupKey = `${storageKey}${BACKUP_SUFFIX}`;

  return {
    load(): PlannerProjectV1 | undefined {
      const target = storage();
      if (!target) return undefined;
      return (
        parseStoredProject(target.getItem(storageKey)) ??
        parseStoredProject(target.getItem(backupKey))
      );
    },
    save(project: PlannerProjectV1): void {
      const target = storage();
      if (!target) return;
      const serialized = serializeProject(project);
      const current = target.getItem(storageKey);
      const backupExists = Boolean(target.getItem(backupKey));
      if (current && parseStoredProject(current) && current !== serialized) {
        target.setItem(backupKey, current);
      }
      target.setItem(storageKey, serialized);
      if (!backupExists && !current) {
        target.setItem(backupKey, serialized);
      }
    },
  };
}
