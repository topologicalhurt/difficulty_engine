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
  | 'setCalendarWeekIndex'
  | 'setBanner'
  | 'setDialog'
  | 'setGanttView'
  | 'setGanttZoom'
  | 'setCalendarLearningMode'
  | 'setPlanColorMode'
  | 'setPlanSectionOpen'
  | 'setLibraryListWidth'
  | 'setProjectBackupsEnabled'
  | 'dismissWarningCode'
  | 'restoreDismissedWarnings'
  | 'toggleConstraintAdvancedGroup'
  | 'selectConstraintField'
  | 'setGraphOptionsOpen'
> {
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
    setCalendarWeekIndex(index: number): void {
      context.commitUi('ui.calendarWeekIndex', {
        calendarWeekIndex: Math.max(0, Math.round(index)),
      });
    },
    setBanner(banner: UiState['banner']): void {
      context.commitUi('ui.banner', { banner });
    },
    setDialog(dialog: UiState['dialog']): void {
      context.commitUi('ui.dialog', { dialog });
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
    setCalendarLearningMode(mode): void {
      commitUiPreference(
        'ui.calendarLearningMode',
        { calendarLearningMode: mode },
        { calendarLearningMode: mode },
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
    setProjectBackupsEnabled(enabled: boolean): void {
      commitUiPreference(
        'ui.projectBackups',
        { backupsEnabled: enabled },
        {
          banner: {
            tone: enabled ? 'success' : 'warn',
            message: enabled
              ? 'Project backups enabled.'
              : 'Project backups disabled.',
          },
        },
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
  };
}
