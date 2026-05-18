import type { AppState, AppView } from '../../core/types';
import { memoizeSelector } from './memo';
import { selectVisibleWarnings } from './warnings';

export const APP_VIEW_DEFINITIONS: Array<{
  id: AppView;
  label: string;
  description: string;
  debugOnly?: boolean;
}> = [
  {
    id: 'plan',
    label: 'Plan',
    description: 'Main study surface with the solved Gantt and calendar.',
  },
  {
    id: 'calendar',
    label: 'Calendar',
    description:
      'Hour-by-hour study blocks for deciding when each book is read.',
  },
  {
    id: 'library',
    label: 'Library',
    description:
      'Search, curate, and edit the reading list and per-book overrides.',
  },
  {
    id: 'constraints',
    label: 'Planner Settings',
    description: 'Choose how the planner paces, orders, and explains work.',
  },
  {
    id: 'ai',
    label: 'AI Suggestions',
    description:
      'Describe what you need next and review suggested books before adding them.',
  },
  {
    id: 'graphs',
    label: 'Graphs',
    description:
      'See prerequisites, co-study links, topic overlap, and workload charts.',
  },
  {
    id: 'diagnostics',
    label: 'Diagnostics',
    description: 'Warnings, evidence, difficulty breakdowns, and skim diffs.',
    debugOnly: true,
  },
  {
    id: 'info',
    label: 'Guide',
    description: 'A tutorial walkthrough for building and reading your plan.',
  },
  {
    id: 'project',
    label: 'Project',
    description: 'Import, export, and project-level actions.',
  },
];

export interface ShellViewModel {
  activeView: AppView;
  activeDescription: string;
  banner: AppState['ui']['banner'];
  dialog: AppState['ui']['dialog'];
  stats: Array<{ label: string; value: string }>;
  tabs: Array<{ id: AppView; label: string; active: boolean }>;
}

export function visibleAppViews(state: AppState): typeof APP_VIEW_DEFINITIONS {
  return APP_VIEW_DEFINITIONS.filter(
    (view) => !view.debugOnly || state.ui.debugUi,
  );
}

export function selectRenderableActiveView(state: AppState): AppView {
  const visibleViews = visibleAppViews(state);
  return visibleViews.some((view) => view.id === state.ui.activeView)
    ? state.ui.activeView
    : 'plan';
}

const selectShellViewModelMemo = memoizeSelector(
  'shell.viewModel',
  (state: AppState) => [
    state.ui.activeView,
    state.ui.debugUi,
    state.ui.banner,
    state.ui.dialog,
    state.project.library.books,
    state.snapshot.relations,
    state.snapshot.renderModel.warnings,
    state.project.uiPreferences.dismissedWarningCodes,
  ],
  (state: AppState): ShellViewModel => {
    const visibleViews = visibleAppViews(state);
    const renderableActiveView = selectRenderableActiveView(state);
    const activeView =
      visibleViews.find((view) => view.id === renderableActiveView) ??
      visibleViews[0] ??
      APP_VIEW_DEFINITIONS[0];
    const warnings = selectVisibleWarnings(state);
    return {
      activeView: activeView.id,
      activeDescription: activeView.description,
      banner: state.ui.banner,
      dialog: state.ui.dialog,
      stats: [
        {
          label: 'books',
          value: String(Object.keys(state.project.library.books).length),
        },
        { label: 'relations', value: String(state.snapshot.relations.length) },
        { label: 'warnings', value: String(warnings.length) },
        {
          label: 'blocking',
          value: String(
            warnings.filter((warning) => warning.severity === 'fail').length,
          ),
        },
      ],
      tabs: visibleViews.map((view) => ({
        id: view.id,
        label: view.label,
        active: view.id === activeView.id,
      })),
    };
  },
);

export function selectShellViewModel(state: AppState): ShellViewModel {
  return selectShellViewModelMemo(state);
}
