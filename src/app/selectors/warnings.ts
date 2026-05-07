import type { AppState, WarningItem } from '../../core/types';

export function selectVisibleWarnings(state: AppState): WarningItem[] {
  const dismissedCodes = new Set(
    state.project.uiPreferences.dismissedWarningCodes,
  );
  return state.snapshot.renderModel.warnings.filter(
    (warning) =>
      warning.severity === 'fail' || !dismissedCodes.has(warning.code),
  );
}

export function selectDismissedWarningCount(state: AppState): number {
  return state.snapshot.renderModel.warnings.length - selectVisibleWarnings(state).length;
}
