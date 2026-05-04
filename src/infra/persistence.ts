import type { PersistenceAdapter, PlannerProjectV1 } from '../core/types';

export function createLocalStoragePersistence(storageKey: string): PersistenceAdapter {
  return {
    load(): PlannerProjectV1 | undefined {
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) {
          return undefined;
        }
        return JSON.parse(raw) as PlannerProjectV1;
      } catch {
        return undefined;
      }
    },
    save(project: PlannerProjectV1): void {
      window.localStorage.setItem(storageKey, JSON.stringify(project));
    },
  };
}
