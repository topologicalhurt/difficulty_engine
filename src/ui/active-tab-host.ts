import type { AppState, PlannerStore } from '../core/types';
import { renderAiView } from './ai-view';
import { renderConstraintsView } from './constraints-view';
import { renderDiagnosticsView } from './diagnostics-view';
import { renderGraphsView } from './graphs-view';
import { renderInfoView } from './info-view';
import { renderLibraryView } from './library-view';
import { renderPlanView } from './plan-view';
import { renderProjectView } from './project-view';
import { captureFocus, restoreFocus } from './focus-preservation';

function renderBody(state: AppState, store: PlannerStore): HTMLElement {
  switch (state.ui.activeView) {
    case 'library':
      return renderLibraryView(state, store);
    case 'constraints':
      return renderConstraintsView(state, store);
    case 'ai':
      return renderAiView(state, store);
    case 'graphs':
      return renderGraphsView(state, store);
    case 'diagnostics':
      return renderDiagnosticsView(state);
    case 'info':
      return renderInfoView();
    case 'project':
      return renderProjectView(state, store);
    case 'plan':
    default:
      return renderPlanView(state, store);
  }
}

export function renderActiveTabBody(
  root: HTMLElement,
  state: AppState,
  store: PlannerStore,
): void {
  const focusSnapshot = captureFocus(root);
  const previousView = root.dataset.activeView;
  const scrollSnapshot =
    previousView === state.ui.activeView
      ? { top: root.scrollTop, left: root.scrollLeft }
      : null;

  root.replaceChildren(renderBody(state, store));
  root.dataset.activeView = state.ui.activeView;

  if (scrollSnapshot) {
    root.scrollTop = scrollSnapshot.top;
    root.scrollLeft = scrollSnapshot.left;
  }
  restoreFocus(root, focusSnapshot);
}
