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

  it('backs up the previous valid project before overwriting it', async () => {
    const firstProject = projectWithBook('first', 'First Book');
    const secondProject = projectWithBook('second', 'Second Book');
    const storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    const persistence = createLocalStoragePersistence(STORAGE_KEY);

    await persistence.save(firstProject);
    await persistence.save(secondProject);

    const primary = JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}');
    const backup = JSON.parse(storage.getItem(`${STORAGE_KEY}.backup`) ?? '{}');
    expect(primary.library.books.second.title).toBe('Second Book');
    expect(backup.library.books.first.title).toBe('First Book');
  });

  it('does not replace an existing backup with corrupt primary data', async () => {
    const backupProject = projectWithBook('backup', 'Backup Book');
    const nextProject = projectWithBook('next', 'Next Book');
    const storage = memoryStorage({
      [STORAGE_KEY]: '{"version":1,',
      [`${STORAGE_KEY}.backup`]: serializeProject(backupProject),
    });
    vi.stubGlobal('localStorage', storage);

    await createLocalStoragePersistence(STORAGE_KEY).save(nextProject);

    const backup = JSON.parse(storage.getItem(`${STORAGE_KEY}.backup`) ?? '{}');
    expect(backup.library.books.backup.title).toBe('Backup Book');
  });

  it('updates the primary save before waiting on folder backups', async () => {
    const firstProject = projectWithBook('first', 'First Book');
    const secondProject = projectWithBook('second', 'Second Book');
    const storage = memoryStorage({
      [STORAGE_KEY]: serializeProject(firstProject),
    });
    let finishBackup!: () => void;
    const fetchImpl = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/__health')) {
        return Promise.resolve(new Response(JSON.stringify({ ok: true })));
      }
      return new Promise<Response>((resolve) => {
          finishBackup = () =>
            resolve(new Response(JSON.stringify({ ok: true })));
      });
    });
    vi.stubGlobal('localStorage', storage);
    const persistence = createLocalStoragePersistence(STORAGE_KEY, {
      backupEndpoint: 'http://127.0.0.1:8787/project-backups/write',
      fetchImpl,
    });

    const savePromise = persistence.save(secondProject);
    const primary = JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}');
    expect(primary.library.books.second.title).toBe('Second Book');

    for (let attempt = 0; !finishBackup && attempt < 5; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    finishBackup();
    await savePromise;
  });

  it('skips folder backup writes when bridge health is unavailable', async () => {
    const firstProject = projectWithBook('first', 'First Book');
    const secondProject = projectWithBook('second', 'Second Book');
    const storage = memoryStorage({
      [STORAGE_KEY]: serializeProject(firstProject),
    });
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('NetworkError when attempting to fetch resource.');
    });
    vi.stubGlobal('localStorage', storage);
    const persistence = createLocalStoragePersistence(STORAGE_KEY, {
      backupEndpoint: 'http://127.0.0.1:8787/project-backups/write',
      fetchImpl,
    });

    await persistence.save(secondProject);

    const primary = JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}');
    expect(primary.library.books.second.title).toBe('Second Book');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:8787/__health',
      expect.anything(),
    );
  });

  it('skips local and folder backups when project backups are disabled', async () => {
    const firstProject = projectWithBook('first', 'First Book');
    const secondProject = projectWithBook('second', 'Second Book');
    firstProject.uiPreferences.backupsEnabled = false;
    secondProject.uiPreferences.backupsEnabled = false;
    const storage = memoryStorage();
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal('localStorage', storage);
    const persistence = createLocalStoragePersistence(STORAGE_KEY, {
      backupEndpoint: 'http://127.0.0.1:8787/project-backups/write',
      fetchImpl,
    });

    await persistence.save(firstProject);
    await persistence.save(secondProject);

    expect(storage.getItem(`${STORAGE_KEY}.backup`)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
