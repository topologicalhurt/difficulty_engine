import { selectShellViewModel } from '../app/selectors/shell';
import type { AppState, PlannerStore } from '../core/types';
import { button, el } from './dom';
import { captureFocus, restoreFocus } from './focus-preservation';
import { renderAiView } from './ai-view';
import { renderConstraintsView } from './constraints-view';
import { renderDiagnosticsView } from './diagnostics-view';
import { renderGraphsView } from './graphs-view';
import { renderInfoView } from './info-view';
import { renderLibraryView } from './library-view';
import { renderPlanView } from './plan-view';
import { renderProjectView } from './project-view';

const SHELL_SLOT = {
  header: 'header',
  tabs: 'tabs',
  banner: 'banner',
  body: 'body',
} as const;

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

function shellSlotProps(
  slot: string,
  className: string,
): { className: string; dataset: Record<string, string> } {
  return {
    className,
    dataset: { shellSlot: slot },
  };
}

function headerStat(label: string, value: string): HTMLElement {
  return el(
    'div',
    { className: 'header-stat' },
    el('strong', { text: value }),
    el('span', { className: 'muted-copy', text: label }),
  );
}

function replaceSlot(
  app: HTMLElement,
  slot: string,
  next: HTMLElement | null,
  before: HTMLElement | null = null,
): void {
  const current = app.querySelector<HTMLElement>(`[data-shell-slot="${slot}"]`);
  if (!next) {
    current?.remove();
    return;
  }
  if (current) {
    current.replaceWith(next);
    return;
  }
  app.insertBefore(next, before);
}

export function renderApp(
  root: HTMLElement,
  state: AppState,
  store: PlannerStore,
): void {
  const focusSnapshot = captureFocus(root);
  const previousView = root.dataset.activeView;
  const previousWorkspace =
    root.querySelector<HTMLElement>('.workspace-content');
  const scrollSnapshot =
    previousView === state.ui.activeView && previousWorkspace
      ? { top: previousWorkspace.scrollTop, left: previousWorkspace.scrollLeft }
      : null;
  const viewModel = selectShellViewModel(state);

  const app =
    root.querySelector<HTMLElement>('.app-shell') ??
    el('div', { className: 'app-shell' });
  const workspace =
    app.querySelector<HTMLElement>(`[data-shell-slot="${SHELL_SLOT.body}"]`) ??
    el(
      'main',
      shellSlotProps(SHELL_SLOT.body, 'main-content workspace-content'),
    );
  const nextBody = renderBody(state, store);

  const header = el(
    'header',
    shellSlotProps(SHELL_SLOT.header, 'app-header'),
    el(
      'div',
      { className: 'app-header-main' },
      el('div', { className: 'eyebrow', text: 'Difficulty Engine' }),
      el('h1', { text: 'Study Planner' }),
      el('p', {
        className: 'muted-copy',
        text: viewModel.activeDescription,
      }),
    ),
    el(
      'div',
      { className: 'app-header-side' },
      ...viewModel.stats.map((item) => headerStat(item.label, item.value)),
    ),
  );

  const tabs = el(
    'div',
    shellSlotProps(SHELL_SLOT.tabs, 'tab-strip-wrap'),
    el(
      'nav',
      { className: 'tab-strip' },
      ...viewModel.tabs.map((view) =>
        button(view.label, {
          className: `tab-button${view.active ? ' active' : ''}`,
          onClick: () => store.commands.setActiveView(view.id),
        }),
      ),
    ),
    el(
      'div',
      { className: 'toolbar-row app-toolbar' },
      button('Add book', {
        className: 'primary-button',
        onClick: () => store.commands.addBook(),
      }),
      button('Open library', {
        className: 'ghost-button',
        onClick: () => store.commands.setActiveView('library'),
      }),
      button('Project', {
        className: 'ghost-button',
        onClick: () => store.commands.setActiveView('project'),
      }),
    ),
  );

  const banner = viewModel.banner
    ? el('div', {
        className: `banner banner-${viewModel.banner.tone}`,
        dataset: { shellSlot: SHELL_SLOT.banner },
        text: viewModel.banner.message,
      })
    : null;

  if (!root.contains(app)) {
    app.append(header, tabs);
    if (banner) app.append(banner);
    app.append(workspace);
    root.replaceChildren(app);
  } else {
    replaceSlot(app, SHELL_SLOT.header, header);
    replaceSlot(app, SHELL_SLOT.tabs, tabs);
    replaceSlot(app, SHELL_SLOT.banner, banner, workspace);
    if (!workspace.parentElement) app.append(workspace);
  }
  workspace.replaceChildren(nextBody);
  root.dataset.activeView = viewModel.activeView;
  if (scrollSnapshot) {
    workspace.scrollTop = scrollSnapshot.top;
    workspace.scrollLeft = scrollSnapshot.left;
  }
  restoreFocus(root, focusSnapshot);
}
