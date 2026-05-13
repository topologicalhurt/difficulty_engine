import { createEmptyProject, normalizeProject } from '../core/project-file';
import type {
  AppState,
  BookRecord,
  CreatePlannerStoreOptions,
  PlannerProjectV1,
  PlannerStore,
} from '../core/types';
import { createCalendarCommands } from './store-calendar-commands';
import type { StoreCommandContext } from './store-command-context';
import { createConstraintCommands } from './store-constraint-commands';
import { createDocumentCommands } from './store-document-commands';
import { createEnrichmentCommands } from './store-enrichment';
import { createLibraryCommands } from './store-library-commands';
import { createProjectCommands } from './store-project-commands';
import { createQbittorrentCommands } from './store-qbittorrent-commands';
import { createMetadataCommands } from './store-metadata-commands';
import { createReadingScopeCommands } from './store-reading-scope-commands';
import { createStoreRuntime } from './store-runtime';
import { createCatalogSearchRunner } from './store-search';
import { createSearchCommands } from './store-search-commands';
import { createUiCommands } from './store-ui-commands';
import { createAiRecommendationCommands } from './store-ai-recommendations';
import { createAiRelationshipCommands } from './store-ai-relationships';
import { createAiWorkflowCommands } from './store-ai-workflow';
import { createAutopilotCommands } from './store-autopilot-commands';

export function createPlannerStore(
  options: CreatePlannerStoreOptions,
): PlannerStore {
  const project = options.initialProject
    ? normalizeProject(
        options.initialProject as unknown as Record<string, unknown>,
      )
    : createEmptyProject();
  const initialQbittorrentConnection =
    options.localSettings?.loadQbittorrentConnection() ?? undefined;
  const initialAiConnection =
    options.localSettings?.loadAiConnection() ?? undefined;
  const runtime = createStoreRuntime({
    initialProject: project,
    initialUiPatch: {
      debugUi: options.debugUi ?? false,
      ...(initialQbittorrentConnection
        ? { qbittorrentConnection: initialQbittorrentConnection }
        : {}),
      ...(initialAiConnection ? { aiConnection: initialAiConnection } : {}),
    },
    engine: options.engine,
    computeAdapter: options.computeAdapter,
  });

  const runCatalogSearch = createCatalogSearchRunner({
    getState: runtime.getState,
    commitUi: (uiPatch) => runtime.commitUi('search.catalog', uiPatch),
    enrichmentProvider: options.enrichmentProvider,
  });

  let refreshBookEnrichment: (bookId: string) => Promise<void> = async () =>
    undefined;
  const context: StoreCommandContext = {
    getState: runtime.getState,
    commitUi: runtime.commitUi,
    commitProject: runtime.commitProject,
    runCatalogSearch,
    refreshBookEnrichment: (bookId) => refreshBookEnrichment(bookId),
  };
  const enrichmentCommands = createEnrichmentCommands({
    context,
    services: options,
    emitEvent: runtime.emitEvent,
  });
  refreshBookEnrichment = enrichmentCommands.refreshBookEnrichment;

  const aiRecommendationCommands = createAiRecommendationCommands(
    context,
    options,
  );
  const aiRelationshipCommands = createAiRelationshipCommands(context, options);
  const aiWorkflowCommands = createAiWorkflowCommands(
    context,
    {
      requestAiClarification: aiRecommendationCommands.requestAiClarification,
      requestAiRecommendations:
        aiRecommendationCommands.requestAiRecommendations,
      requestAiRelationshipReorganization:
        aiRelationshipCommands.requestAiRelationshipReorganization,
    },
    {
      hasClarificationProvider:
        Boolean(options.aiRecommendationProvider?.clarifyRecommendation),
    },
  );

  const store: PlannerStore = {
    selectors: {
      getState(): AppState {
        return runtime.getState();
      },
      getProject(): PlannerProjectV1 {
        return runtime.getState().project;
      },
      getSnapshot() {
        return runtime.getState().snapshot;
      },
      getBook(id: string): BookRecord | undefined {
        return runtime.getState().project.library.books[id];
      },
    },
    commands: {
      ...createUiCommands(context),
      ...createDocumentCommands(context, options),
      ...createConstraintCommands(context),
      ...createLibraryCommands(context),
      ...createReadingScopeCommands(context),
      ...createCalendarCommands(context),
      ...createSearchCommands(context),
      ...createProjectCommands(context),
      ...createMetadataCommands(context, options),
      ...createQbittorrentCommands(context, options),
      ...aiRecommendationCommands,
      ...aiRelationshipCommands,
      ...aiWorkflowCommands,
      ...createAutopilotCommands(context, options),
      ...enrichmentCommands,
    },
    subscriptions: {
      subscribe: runtime.subscribe,
      subscribeEvents: runtime.subscribeEvents,
    },
    exportProject(): string {
      return runtime.exportProject();
    },
  };

  return store;
}
