import { createEmptyProject, normalizeProject, serializeProject } from '../core/project-file';
import type {
  AppState,
  BookRecord,
  CreatePlannerStoreOptions,
  PlannerProjectV1,
  PlannerStore,
  PlannerStoreEvent,
  UiState,
} from '../core/types';
import { createCalendarCommands } from './store-calendar-commands';
import type { StoreCommandContext } from './store-command-context';
import { createConstraintCommands } from './store-constraint-commands';
import { createEnrichmentCommands } from './store-enrichment';
import {
  buildUi,
  withSnapshot,
} from './store-helpers';
import { createLibraryCommands } from './store-library-commands';
import { createProjectCommands } from './store-project-commands';
import { createQbittorrentCommands } from './store-qbittorrent-commands';
import { createCatalogSearchRunner } from './store-search';
import { createSearchCommands } from './store-search-commands';
import { createUiCommands } from './store-ui-commands';
import { assertProjectMutation, assertUiMutation } from './wiring/executor';
import type { WiringContractId } from './wiring/contracts';

type StateListener = (state: AppState) => void;
type EventListener = (event: PlannerStoreEvent) => void;

export function createPlannerStore(options: CreatePlannerStoreOptions): PlannerStore {
  const project = options.initialProject
    ? normalizeProject(options.initialProject as unknown as Record<string, unknown>)
    : createEmptyProject();
  const initialQbittorrentConnection =
    options.localSettings?.loadQbittorrentConnection() ?? undefined;
  let state = withSnapshot(
    project,
    buildUi(project, initialQbittorrentConnection
      ? { qbittorrentConnection: initialQbittorrentConnection }
      : {}),
    options.engine,
  );
  const stateListeners = new Set<StateListener>();
  const eventListeners = new Set<EventListener>();

  function notifyState(): void {
    stateListeners.forEach((listener) => listener(state));
  }

  function emitEvent(
    type: PlannerStoreEvent['type'],
    payload?: PlannerStoreEvent['payload'],
  ): void {
    const event: PlannerStoreEvent = {
      type,
      project: state.project,
      snapshot: state.snapshot,
      payload,
    };
    eventListeners.forEach((listener) => listener(event));
  }

  function maybeEmitBlockingWarning(): void {
    const failCount = state.snapshot.renderModel.warnings.filter(
      (warning) => warning.severity === 'fail',
    ).length;
    if (failCount) emitEvent('blocking-warning-raised', { failCount });
  }

  function commitUi(contractId: WiringContractId, uiPatch: Partial<UiState>): void {
    assertUiMutation(contractId);
    state = {
      ...state,
      ui: buildUi(state.project, {
        ...state.ui,
        ...uiPatch,
      }),
    };
    notifyState();
  }

  function commitProject(
    contractId: WiringContractId,
    nextProject: PlannerProjectV1,
    uiPatch: Partial<UiState> = {},
    recompute = true,
  ): void {
    assertProjectMutation(contractId, recompute);
    const canonicalProject = normalizeProject(nextProject as unknown as Record<string, unknown>);
    const serializedProject = serializeProject(canonicalProject);
    const keepDraft =
      uiPatch.importExportDirty == null ? state.ui.importExportDirty : uiPatch.importExportDirty;
    const importExportText =
      uiPatch.importExportText ?? (keepDraft ? state.ui.importExportText : serializedProject);
    const nextUi = buildUi(canonicalProject, {
      ...state.ui,
      ...uiPatch,
      ganttView: uiPatch.ganttView ?? canonicalProject.uiPreferences.ganttView,
      planColorMode: uiPatch.planColorMode ?? canonicalProject.uiPreferences.planColorMode,
      importExportText,
      importExportDirty:
        uiPatch.importExportDirty ?? (keepDraft && importExportText !== serializedProject),
    });
    state = recompute
      ? withSnapshot(canonicalProject, nextUi, options.engine)
      : {
          ...state,
          project: canonicalProject,
          ui: nextUi,
          enrichment: { byBookId: canonicalProject.enrichmentCache },
        };
    notifyState();
    emitEvent('project-changed');
    if (recompute) {
      emitEvent('snapshot-updated');
      maybeEmitBlockingWarning();
    }
  }

  const runCatalogSearch = createCatalogSearchRunner({
    getState: () => state,
    commitUi: (uiPatch) => commitUi('search.catalog', uiPatch),
    enrichmentProvider: options.enrichmentProvider,
  });

  let refreshBookEnrichment: (bookId: string) => Promise<void> = async () => undefined;
  const context: StoreCommandContext = {
    getState: () => state,
    commitUi,
    commitProject,
    runCatalogSearch,
    refreshBookEnrichment: (bookId) => refreshBookEnrichment(bookId),
  };
  const enrichmentCommands = createEnrichmentCommands({
    context,
    services: options,
    emitEvent,
  });
  refreshBookEnrichment = enrichmentCommands.refreshBookEnrichment;

  const store: PlannerStore = {
    selectors: {
      getState(): AppState {
        return state;
      },
      getProject(): PlannerProjectV1 {
        return state.project;
      },
      getSnapshot() {
        return state.snapshot;
      },
      getBook(id: string): BookRecord | undefined {
        return state.project.library.books[id];
      },
    },
    commands: {
      ...createUiCommands(context),
      ...createConstraintCommands(context),
      ...createLibraryCommands(context),
      ...createCalendarCommands(context),
      ...createSearchCommands(context),
      ...createProjectCommands(context),
      ...createQbittorrentCommands(context, options),
      ...enrichmentCommands,
    },
    subscriptions: {
      subscribe(listener: StateListener): () => void {
        stateListeners.add(listener);
        listener(state);
        return () => {
          stateListeners.delete(listener);
        };
      },
      subscribeEvents(listener: EventListener): () => void {
        eventListeners.add(listener);
        return () => {
          eventListeners.delete(listener);
        };
      },
    },
    exportProject(): string {
      return serializeProject(state.project);
    },
  };

  return store;
}
