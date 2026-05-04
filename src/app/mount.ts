import { createPlannerStore } from './store';
import { createPlannerEngine } from '../core/engine';
import { createEmptyProject, normalizeProject } from '../core/project-file';
import type { MountPlannerAppOptions, PlannerAppHandle } from '../core/types';
import { renderApp } from '../ui/app-shell';

async function resolveInitialProject(
  options: MountPlannerAppOptions,
): Promise<MountPlannerAppOptions['initialProject']> {
  if (options.initialProject) {
    return options.initialProject;
  }
  if (!options.persistence) {
    return createEmptyProject();
  }
  try {
    const loaded = await options.persistence.load();
    return loaded
      ? normalizeProject(loaded as unknown as Record<string, unknown>)
      : createEmptyProject();
  } catch (error) {
    options.logger.warn('planner.persistence.load-failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return createEmptyProject();
  }
}

export async function mountPlannerApp(
  options: MountPlannerAppOptions,
): Promise<PlannerAppHandle> {
  const initialProject = await resolveInitialProject(options);
  const engine = createPlannerEngine({
    clock: options.clock,
    logger: options.logger,
  });
  const store = createPlannerStore({
    initialProject,
    engine,
    enrichmentProvider: options.enrichmentProvider,
    localSettings: options.localSettings,
    qbittorrentService: options.qbittorrentService,
    logger: options.logger,
    clock: options.clock,
  });

  const host = document.createElement('div');
  host.className = 'difficulty-engine-app';
  options.container.replaceChildren(host);

  const unsubscribeState = store.subscriptions.subscribe((state) => {
    renderApp(host, state, store);
    if (options.persistence) {
      void Promise.resolve(options.persistence.save(state.project)).catch((error) => {
        options.logger.warn('planner.persistence.save-failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  });
  const unsubscribeEvents = store.subscriptions.subscribeEvents((event) => {
    if (event.type === 'blocking-warning-raised') {
      options.logger.warn('planner.blocking-warning', event.payload);
    }
  });

  return {
    store,
    unmount(): void {
      unsubscribeState();
      unsubscribeEvents();
      options.container.replaceChildren();
    },
  };
}
