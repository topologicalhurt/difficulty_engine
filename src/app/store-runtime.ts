import { normalizeProject, serializeProject } from '../core/project-file';
import type {
  AppState,
  CreatePlannerStoreOptions,
  PlannerProjectV1,
  PlannerStoreEvent,
  UiState,
} from '../core/types';
import { buildUi, withSnapshot } from './store-helpers';
import { assertProjectMutation, assertUiMutation } from './wiring/executor';
import type { WiringContractId } from './wiring/contracts';

export type StateListener = (state: AppState) => void;
export type EventListener = (event: PlannerStoreEvent) => void;

interface StoreRuntimeOptions {
  initialProject: PlannerProjectV1;
  initialUiPatch?: Partial<UiState>;
  engine: CreatePlannerStoreOptions['engine'];
}

export interface StoreRuntime {
  getState(): AppState;
  commitUi(contractId: WiringContractId, uiPatch: Partial<UiState>): void;
  commitProject(
    contractId: WiringContractId,
    nextProject: PlannerProjectV1,
    uiPatch?: Partial<UiState>,
    recompute?: boolean,
  ): void;
  emitEvent(
    type: PlannerStoreEvent['type'],
    payload?: PlannerStoreEvent['payload'],
  ): void;
  subscribe(listener: StateListener): () => void;
  subscribeEvents(listener: EventListener): () => void;
  exportProject(): string;
}

export function createStoreRuntime(options: StoreRuntimeOptions): StoreRuntime {
  let state = withSnapshot(
    options.initialProject,
    buildUi(options.initialProject, options.initialUiPatch),
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

  return {
    getState(): AppState {
      return state;
    },
    commitUi(contractId: WiringContractId, uiPatch: Partial<UiState>): void {
      assertUiMutation(contractId);
      state = {
        ...state,
        ui: buildUi(state.project, {
          ...state.ui,
          ...uiPatch,
        }),
      };
      notifyState();
    },
    commitProject(
      contractId: WiringContractId,
      nextProject: PlannerProjectV1,
      uiPatch: Partial<UiState> = {},
      recompute = true,
    ): void {
      assertProjectMutation(contractId, recompute);
      const canonicalProject = normalizeProject(
        nextProject as unknown as Record<string, unknown>,
      );
      const serializedProject = serializeProject(canonicalProject);
      const keepDraft =
        uiPatch.importExportDirty == null
          ? state.ui.importExportDirty
          : uiPatch.importExportDirty;
      const importExportText =
        uiPatch.importExportText ??
        (keepDraft ? state.ui.importExportText : serializedProject);
      const nextUi = buildUi(canonicalProject, {
        ...state.ui,
        ...uiPatch,
        ganttView:
          uiPatch.ganttView ?? canonicalProject.uiPreferences.ganttView,
        planColorMode:
          uiPatch.planColorMode ?? canonicalProject.uiPreferences.planColorMode,
        importExportText,
        importExportDirty:
          uiPatch.importExportDirty ??
          (keepDraft && importExportText !== serializedProject),
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
    },
    emitEvent,
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
    exportProject(): string {
      return serializeProject(state.project);
    },
  };
}
