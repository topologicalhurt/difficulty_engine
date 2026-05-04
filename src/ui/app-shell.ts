import { selectShellViewModel } from '../app/selectors/shell';
import type { AppState, PlannerStore } from '../core/types';
import { button, el } from './dom';
import { renderConstraintsView } from './constraints-view';
import { renderDiagnosticsView } from './diagnostics-view';
import { renderGraphsView } from './graphs-view';
import { renderInfoView } from './info-view';
import { renderLibraryView } from './library-view';
import { renderPlanView } from './plan-view';
import { renderProjectView } from './project-view';

function renderBody(state: AppState, store: PlannerStore): HTMLElement {
  switch (state.ui.activeView) {
    case 'library':
      return renderLibraryView(state, store);
    case 'constraints':
      return renderConstraintsView(state, store);
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

function headerStat(label: string, value: string): HTMLElement {
  return el(
    'div',
    { className: 'header-stat' },
    el('strong', { text: value }),
    el('span', { className: 'muted-copy', text: label }),
  );
}

function captureFocus(root: HTMLElement): {
  key: string;
  start: number | null;
  end: number | null;
  scrollTop: number;
  scrollLeft: number;
} | null {
  const active = document.activeElement;
  if (
    !active ||
    !(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) ||
    !root.contains(active)
  ) {
    return null;
  }
  const key = active.dataset.focusKey;
  if (!key) {
    return null;
  }
  return {
    key,
    start:
      active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
        ? active.selectionStart
        : null,
    end:
      active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
        ? active.selectionEnd
        : null,
    scrollTop:
      active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
        ? active.scrollTop
        : 0,
    scrollLeft:
      active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
        ? active.scrollLeft
        : 0,
  };
}

function findFocusTarget(root: HTMLElement, key: string): HTMLElement | null {
  return (
    Array.from(root.querySelectorAll<HTMLElement>('[data-focus-key]')).find(
      (node) => node.dataset.focusKey === key,
    ) ?? null
  );
}

function restoreFocus(
  root: HTMLElement,
  snapshot: ReturnType<typeof captureFocus>,
): void {
  if (!snapshot) {
    return;
  }
  const target = findFocusTarget(root, snapshot.key);
  if (
    !target ||
    !(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)
  ) {
    return;
  }
  target.focus({ preventScroll: true });
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    try {
      if (snapshot.start != null && snapshot.end != null) {
        target.setSelectionRange(snapshot.start, snapshot.end);
      }
    } catch {
      // Some input types do not support selection ranges.
    }
    target.scrollTop = snapshot.scrollTop;
    target.scrollLeft = snapshot.scrollLeft;
  }
}

export function renderApp(root: HTMLElement, state: AppState, store: PlannerStore): void {
  const focusSnapshot = captureFocus(root);
  const previousView = root.dataset.activeView;
  const previousWorkspace = root.querySelector<HTMLElement>('.workspace-content');
  const scrollSnapshot =
    previousView === state.ui.activeView && previousWorkspace
      ? { top: previousWorkspace.scrollTop, left: previousWorkspace.scrollLeft }
      : null;
  const viewModel = selectShellViewModel(state);

  const app = el(
    'div',
    { className: 'app-shell' },
    el(
      'header',
      { className: 'app-header' },
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
    ),
    el(
      'div',
      { className: 'tab-strip-wrap' },
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
        button('Add book', { className: 'primary-button', onClick: () => store.commands.addBook() }),
        button('Open library', { className: 'ghost-button', onClick: () => store.commands.setActiveView('library') }),
        button('Project', { className: 'ghost-button', onClick: () => store.commands.setActiveView('project') }),
      ),
    ),
    viewModel.banner ? el('div', { className: `banner banner-${viewModel.banner.tone}`, text: viewModel.banner.message }) : null,
    el('main', { className: 'main-content workspace-content' }, renderBody(state, store)),
  );

  root.replaceChildren(app);
  root.dataset.activeView = viewModel.activeView;
  if (scrollSnapshot) {
    const workspace = root.querySelector<HTMLElement>('.workspace-content');
    if (workspace) {
      workspace.scrollTop = scrollSnapshot.top;
      workspace.scrollLeft = scrollSnapshot.left;
    }
  }
  restoreFocus(root, focusSnapshot);
}
