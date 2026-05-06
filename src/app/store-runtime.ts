import { normalizeProject, serializeProject } from '../core/project-file';
import type {
  AppState,
  CreatePlannerStoreOptions,
  PlannerComputeAdapter,
  PlannerProjectV1,
  PlannerStoreEvent,
  UiState,
} from '../core/types';
import { readPerformanceNowMs } from './performance';
import {
  INITIAL_PERFORMANCE_STATE,
  buildUi,
  withSnapshot,
} from './store-helpers';
import { assertProjectMutation, assertUiMutation } from './wiring/executor';
import type { WiringContractId } from './wiring/contracts';

export type StateListener = (state: AppState) => void;
export type EventListener = (event: PlannerStoreEvent) => void;

interface StoreRuntimeOptions {
  initialProject: PlannerProjectV1;
  initialUiPatch?: Partial<UiState>;
  engine: CreatePlannerStoreOptions['engine'];
  computeAdapter?: PlannerComputeAdapter;
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
    INITIAL_PERFORMANCE_STATE,
  );
  const stateListeners = new Set<StateListener>();
  const eventListeners = new Set<EventListener>();
  let pendingComputeRevision = 0;

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

  function applyProjectState(
    project: PlannerProjectV1,
    ui: UiState,
    performance: AppState['performance'],
  ): void {
    state = {
      project,
      ui,
      snapshot: state.snapshot,
      enrichment: { byBookId: project.enrichmentCache },
      performance,
    };
    notifyState();
    emitEvent('project-changed');
  }

  function applyComputedSnapshot(
    snapshotState: Pick<AppState, 'snapshot' | 'performance'>,
  ): void {
    state = {
      ...state,
      snapshot: snapshotState.snapshot,
      performance: snapshotState.performance,
    };
    notifyState();
    emitEvent('snapshot-updated');
    maybeEmitBlockingWarning();
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
        performance: {
          ...state.performance,
          uiRevision: state.performance.uiRevision + 1,
        },
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
      const nextPerformance = {
        ...state.performance,
        projectRevision: state.performance.projectRevision + 1,
        uiRevision: state.performance.uiRevision + 1,
        snapshotRevision: recompute
          ? state.performance.snapshotRevision + 1
          : state.performance.snapshotRevision,
      };
      if (
        recompute &&
        options.computeAdapter &&
        options.computeAdapter.mode === 'worker' &&
        (options.computeAdapter.shouldDefer?.(canonicalProject) ?? true)
      ) {
        const computeRevision = ++pendingComputeRevision;
        const startedAt = readPerformanceNowMs();
        applyProjectState(canonicalProject, nextUi, nextPerformance);
        options.computeAdapter
          .compute(canonicalProject)
          .then((snapshot) => {
            if (computeRevision !== pendingComputeRevision) return;
            const workerMs = readPerformanceNowMs() - startedAt;
            applyComputedSnapshot({
              snapshot,
              performance: {
                ...state.performance,
                lastSnapshotMs: workerMs,
                lastWorkerMs: workerMs,
              },
            });
          })
          .catch((error: unknown) => {
            if (computeRevision !== pendingComputeRevision) return;
            pendingComputeRevision += 1;
            if (
              error instanceof Error &&
              error.message === 'Planner compute cancelled'
            ) {
              return;
            }
            const fallbackStartedAt = readPerformanceNowMs();
            const snapshot = options.engine.computeSnapshot(state.project);
            const fallbackMs = readPerformanceNowMs() - fallbackStartedAt;
            applyComputedSnapshot({
              snapshot,
              performance: {
                ...state.performance,
                lastSnapshotMs: fallbackMs,
                lastWorkerMs: readPerformanceNowMs() - startedAt,
              },
            });
          });
        return;
      }
      if (options.computeAdapter?.mode === 'worker') {
        pendingComputeRevision += 1;
      }
      state = recompute
        ? withSnapshot(canonicalProject, nextUi, options.engine, {
            ...nextPerformance,
          })
        : {
            ...state,
            project: canonicalProject,
            ui: nextUi,
            enrichment: { byBookId: canonicalProject.enrichmentCache },
            performance: nextPerformance,
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
