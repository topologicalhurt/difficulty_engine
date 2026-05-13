// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createProjectSaveQueue, mountPlannerApp } from '../../src/app/mount';
import { plannerClock } from '../../src/core/time';
import type { PlannerProjectV1 } from '../../src/core/types';
import {
  makeProject,
  makeTestEnrichmentProvider,
  silentLogger,
} from './store-test-utils';

function projectWithTitle(title: string): PlannerProjectV1 {
  const project = makeProject();
  project.library.books['book-1'].title = title;
  return project;
}

describe('project persistence save queue', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('serializes saves and coalesces pending writes to the latest project', async () => {
    let releaseFirst!: () => void;
    let resolveFirstSaveStarted!: () => void;
    const firstSaveStarted = new Promise<void>((resolve) => {
      resolveFirstSaveStarted = resolve;
    });
    const saves: string[] = [];
    const queue = createProjectSaveQueue(
      {
        load: () => undefined,
        save: async (project) => {
          saves.push(project.library.books['book-1']?.title ?? '');
          if (saves.length === 1) {
            resolveFirstSaveStarted();
            await new Promise<void>((release) => {
              releaseFirst = release;
            });
          }
        },
      },
      silentLogger,
    );

    queue.enqueue(projectWithTitle('First'));
    await firstSaveStarted;
    queue.enqueue(projectWithTitle('Second'));
    queue.enqueue(projectWithTitle('Third'));
    releaseFirst();
    await queue.flush();

    expect(saves).toEqual(['First', 'Third']);
  });

  it('waits for pending persistence before app unmount resolves', async () => {
    let releaseSave!: () => void;
    let resolveSaveStarted!: () => void;
    const saveStarted = new Promise<void>((resolve) => {
      resolveSaveStarted = resolve;
    });
    const saves: string[] = [];
    const container = document.createElement('div');
    const handle = await mountPlannerApp({
      container,
      initialProject: makeProject(),
      persistence: {
        load: () => undefined,
        save: async (project) => {
          saves.push(project.library.books['book-1']?.title ?? '');
          resolveSaveStarted();
          await new Promise<void>((resolve) => {
            releaseSave = resolve;
          });
        },
      },
      enrichmentProvider: makeTestEnrichmentProvider(),
      logger: silentLogger,
      clock: plannerClock,
    });

    handle.store.commands.updateBook('book-1', { title: 'Persist Me' });
    await saveStarted;
    let unmounted = false;
    const unmount = handle.unmount().then(() => {
      unmounted = true;
    });
    await Promise.resolve();

    expect(unmounted).toBe(false);
    releaseSave();
    await unmount;
    expect(saves).toEqual(['Persist Me']);
  });

  it('flushes UI renders through a timer fallback when animation frames stall', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const container = document.createElement('div');
    const handle = await mountPlannerApp({
      container,
      initialProject: makeProject(),
      enrichmentProvider: makeTestEnrichmentProvider(),
      logger: silentLogger,
      clock: plannerClock,
    });

    handle.store.commands.setActiveView('graphs');
    vi.advanceTimersByTime(51);
    await Promise.resolve();
    await Promise.resolve();

    expect(container.textContent).toContain('Graph options');
    await handle.unmount();
  });
});
