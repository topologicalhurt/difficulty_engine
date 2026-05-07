import type {
  AppView,
  PlannerProjectV1,
  PlannerStoreCommands,
  UiState,
} from '../core/types';
import {
  PLAN_ZOOM_MAX,
  PLAN_ZOOM_MIN,
  clampLibraryListWidth,
} from '../core/constants';
import {
  bridgeDocumentEndpoint,
  bridgeEndpoint,
} from '../infra/document-bridge-url';
import type { StoreCommandContext } from './store-command-context';
import type { WiringContractId } from './wiring/contracts';

type UiPreferencePatch = Partial<PlannerProjectV1['uiPreferences']>;

export function createUiCommands(
  context: StoreCommandContext,
): Pick<
  PlannerStoreCommands,
  | 'setActiveView'
  | 'selectBook'
  | 'selectCalendarEntry'
  | 'setBanner'
  | 'setGanttView'
  | 'setGanttZoom'
  | 'setPlanColorMode'
  | 'setPlanSectionOpen'
  | 'setLibraryListWidth'
  | 'dismissWarningCode'
  | 'restoreDismissedWarnings'
  | 'toggleConstraintAdvancedGroup'
  | 'selectConstraintField'
  | 'setGraphOptionsOpen'
  | 'openBookDocument'
  | 'readBookDocument'
  | 'closeBookDocumentReader'
> {
  let documentReadSequence = 0;

  function commitUiPreference(
    contractId: WiringContractId,
    preferencePatch: UiPreferencePatch,
    uiPatch: Partial<UiState>,
  ): void {
    const state = context.getState();
    context.commitProject(
      contractId,
      {
        ...state.project,
        uiPreferences: {
          ...state.project.uiPreferences,
          ...preferencePatch,
        },
      },
      uiPatch,
      false,
    );
  }

  return {
    setActiveView(activeView: AppView): void {
      context.commitUi('ui.activeView', { activeView });
    },
    selectBook(bookId: string | null): void {
      context.commitUi('ui.selectBook', {
        selectedBookId: bookId,
        selectedCalendarEntry: null,
      });
    },
    selectCalendarEntry(dateKey: string, bookId: string): void {
      context.commitUi('ui.selectCalendarEntry', {
        selectedBookId: bookId,
        selectedCalendarEntry: { dateKey, bookId },
      });
    },
    setBanner(banner: UiState['banner']): void {
      context.commitUi('ui.banner', { banner });
    },
    setGanttView(ganttView: UiState['ganttView']): void {
      commitUiPreference('ui.ganttView', { ganttView }, { ganttView });
    },
    setGanttZoom(ganttZoom: number): void {
      const nextZoom = Math.max(
        PLAN_ZOOM_MIN,
        Math.min(PLAN_ZOOM_MAX, Math.round(ganttZoom * 100) / 100),
      );
      commitUiPreference(
        'ui.ganttZoom',
        { ganttZoom: nextZoom },
        { ganttZoom: nextZoom },
      );
    },
    setPlanColorMode(planColorMode: UiState['planColorMode']): void {
      commitUiPreference(
        'ui.planColorMode',
        { planColorMode },
        { planColorMode },
      );
    },
    setPlanSectionOpen(section, open): void {
      const state = context.getState();
      const planSections = {
        ...state.project.uiPreferences.planSections,
        [section]: open,
      };
      commitUiPreference('ui.planSections', { planSections }, { planSections });
    },
    setLibraryListWidth(widthPx: number): void {
      const libraryListWidthPx = clampLibraryListWidth(widthPx);
      commitUiPreference(
        'ui.libraryListWidth',
        { libraryListWidthPx },
        { libraryListWidthPx },
      );
    },
    dismissWarningCode(code: string): void {
      const trimmedCode = code.trim();
      if (!trimmedCode) return;
      const state = context.getState();
      const dismissible = state.snapshot.renderModel.warnings.some(
        (warning) =>
          warning.code === trimmedCode && warning.severity !== 'fail',
      );
      if (!dismissible) return;
      const dismissedWarningCodes = Array.from(
        new Set([
          ...state.project.uiPreferences.dismissedWarningCodes,
          trimmedCode,
        ]),
      ).sort();
      commitUiPreference(
        'ui.dismissWarningCode',
        { dismissedWarningCodes },
        {},
      );
    },
    restoreDismissedWarnings(): void {
      const state = context.getState();
      if (!state.project.uiPreferences.dismissedWarningCodes.length) return;
      commitUiPreference(
        'ui.restoreDismissedWarnings',
        { dismissedWarningCodes: [] },
        {},
      );
    },
    toggleConstraintAdvancedGroup(group: string): void {
      const state = context.getState();
      const current = new Set(state.ui.openConstraintGroups);
      if (current.has(group)) current.delete(group);
      else current.add(group);
      context.commitUi('ui.constraintAdvancedGroup', {
        openConstraintGroups: [...current].sort(),
      });
    },
    selectConstraintField(key): void {
      context.commitUi('ui.constraintField', { selectedConstraintKey: key });
    },
    setGraphOptionsOpen(open: boolean): void {
      context.commitUi('ui.graphOptionsOpen', { graphOptionsOpen: open });
    },
    async openBookDocument(bookId: string, documentId: string): Promise<void> {
      const state = context.getState();
      const book = state.project.library.books[bookId];
      const document = book?.documents?.find((item) => item.id === documentId);
      if (!book || !document) return;
      try {
        const response = await fetch(
          bridgeEndpoint(
            state.ui.qbittorrentConnection.baseUrl,
            '/documents/open',
          ),
          {
            method: 'POST',
            body: JSON.stringify({ path: document.storagePath }),
            headers: { 'Content-Type': 'application/json' },
          },
        );
        if (!response.ok) throw new Error(await response.text());
        context.commitUi('ui.documentOpen', {
          banner: { tone: 'success', message: `Opened ${document.fileName}.` },
        });
      } catch (error) {
        context.commitUi('ui.documentOpen', {
          banner: {
            tone: 'error',
            message:
              error instanceof Error
                ? error.message
                : `Could not open ${document.fileName}.`,
          },
        });
      }
    },
    async readBookDocument(bookId: string, documentId: string): Promise<void> {
      const state = context.getState();
      const book = state.project.library.books[bookId];
      const document = book?.documents?.find((item) => item.id === documentId);
      if (!book || !document) return;
      const requestSequence = (documentReadSequence += 1);
      context.commitUi('ui.documentReader', {
        documentReader: {
          bookId,
          documentId,
          status: 'loading',
          title: document.fileName,
          text: '',
          error: null,
        },
      });
      try {
        const response = await fetch(
          bridgeDocumentEndpoint(
            state.ui.qbittorrentConnection.baseUrl,
            '/documents/read-text',
            document.storagePath,
          ),
        );
        if (!response.ok) throw new Error(await response.text());
        const text = await response.text();
        if (requestSequence !== documentReadSequence) return;
        context.commitUi('ui.documentReader', {
          documentReader: {
            bookId,
            documentId,
            status: 'ready',
            title: document.fileName,
            text,
            error: null,
          },
        });
      } catch (error) {
        if (requestSequence !== documentReadSequence) return;
        context.commitUi('ui.documentReader', {
          documentReader: {
            bookId,
            documentId,
            status: 'failed',
            title: document.fileName,
            text: '',
            error:
              error instanceof Error
                ? error.message
                : 'Could not read document text.',
          },
        });
      }
    },
    closeBookDocumentReader(): void {
      documentReadSequence += 1;
      context.commitUi('ui.documentReader', {
        documentReader: {
          bookId: null,
          documentId: null,
          status: 'idle',
          title: '',
          text: '',
          error: null,
        },
      });
    },
  };
}
