import { afterEach, describe, expect, it, vi } from 'vitest';

import { EXAMPLE_BOOK } from '../../src/core/defaults';
import { createEmptyProject, serializeProject } from '../../src/core/project-file';
import type { PlannerProjectV1 } from '../../src/core/types';
import { createLocalStoragePersistence } from '../../src/infra/persistence';

const STORAGE_KEY = 'planner.persistence.test';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

function projectWithBook(id: string, title: string): PlannerProjectV1 {
  const project = createEmptyProject();
  project.library.books[id] = {
    ...EXAMPLE_BOOK,
    id,
    title,
    short: title,
    pages: 123,
  };
  return project;
}

describe('local project persistence', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads the known-good backup when the primary project is corrupt', async () => {
    const backupProject = projectWithBook('backup', 'Backup Book');
    vi.stubGlobal(
      'localStorage',
      memoryStorage({
        [STORAGE_KEY]: '{"version":1,',
        [`${STORAGE_KEY}.backup`]: serializeProject(backupProject),
      }),
    );

    const loaded = await createLocalStoragePersistence(STORAGE_KEY).load();

    expect(loaded?.library.books.backup?.title).toBe('Backup Book');
  });

  it('backs up the previous valid project before overwriting it', () => {
    const firstProject = projectWithBook('first', 'First Book');
    const secondProject = projectWithBook('second', 'Second Book');
    const storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    const persistence = createLocalStoragePersistence(STORAGE_KEY);

    persistence.save(firstProject);
    persistence.save(secondProject);

    const primary = JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}');
    const backup = JSON.parse(storage.getItem(`${STORAGE_KEY}.backup`) ?? '{}');
    expect(primary.library.books.second.title).toBe('Second Book');
    expect(backup.library.books.first.title).toBe('First Book');
  });

  it('does not replace an existing backup with corrupt primary data', () => {
    const backupProject = projectWithBook('backup', 'Backup Book');
    const nextProject = projectWithBook('next', 'Next Book');
    const storage = memoryStorage({
      [STORAGE_KEY]: '{"version":1,',
      [`${STORAGE_KEY}.backup`]: serializeProject(backupProject),
    });
    vi.stubGlobal('localStorage', storage);

    createLocalStoragePersistence(STORAGE_KEY).save(nextProject);

    const backup = JSON.parse(storage.getItem(`${STORAGE_KEY}.backup`) ?? '{}');
    expect(backup.library.books.backup.title).toBe('Backup Book');
  });
});
