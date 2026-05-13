import type { PersistenceAdapter, PlannerProjectV1 } from '../core/types';
import { normalizeProject, serializeProject } from '../core/project-file';

const BACKUP_SUFFIX = '.backup';
const BACKUP_ENDPOINT_TIMEOUT_MS = 2500;

export interface LocalStoragePersistenceOptions {
  backupEndpoint?: string;
  fetchImpl?: typeof fetch;
}

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
  options: LocalStoragePersistenceOptions = {},
): PersistenceAdapter {
  const backupKey = `${storageKey}${BACKUP_SUFFIX}`;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch?.bind(globalThis);

  async function writeBackupFolderSnapshot(projectJson: string): Promise<void> {
    if (!options.backupEndpoint || !fetchImpl) return;
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(
      () => controller.abort(),
      BACKUP_ENDPOINT_TIMEOUT_MS,
    );
    try {
      await fetchImpl(options.backupEndpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ storageKey, projectJson }),
      });
    } catch {
      // Folder backups are best-effort; localStorage remains the primary save.
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }

  return {
    load(): PlannerProjectV1 | undefined {
      const target = storage();
      if (!target) return undefined;
      return (
        parseStoredProject(target.getItem(storageKey)) ??
        parseStoredProject(target.getItem(backupKey))
      );
    },
    async save(project: PlannerProjectV1): Promise<void> {
      const target = storage();
      if (!target) return;
      const serialized = serializeProject(project);
      const current = target.getItem(storageKey);
      const backupExists = Boolean(target.getItem(backupKey));
      const backupsEnabled = project.uiPreferences.backupsEnabled;
      if (
        backupsEnabled &&
        current &&
        parseStoredProject(current) &&
        current !== serialized
      ) {
        target.setItem(backupKey, current);
        await writeBackupFolderSnapshot(current);
      }
      target.setItem(storageKey, serialized);
      if (backupsEnabled && !backupExists && !current) {
        target.setItem(backupKey, serialized);
        await writeBackupFolderSnapshot(serialized);
      }
    },
  };
}
