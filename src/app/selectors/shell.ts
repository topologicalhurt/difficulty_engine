import type { AppState, AppView } from '../../core/types';

export const APP_VIEW_DEFINITIONS: Array<{
  id: AppView;
  label: string;
  description: string;
}> = [
  {
    id: 'plan',
    label: 'Plan',
    description: 'Main study surface with the solved Gantt and calendar.',
  },
  {
    id: 'library',
    label: 'Library',
    description:
      'Search, curate, and edit the reading list and per-book overrides.',
  },
  {
    id: 'constraints',
    label: 'Constraints',
    description: 'Advanced scheduling, pacing, and inference settings.',
  },
  {
    id: 'ai',
    label: 'AI',
    description:
      'Request and review AI-suggested additions before applying them.',
  },
  {
    id: 'graphs',
    label: 'Graphs',
    description:
      'DAG, network, hypergraph, weekly load, occupancy, and difficulty ladder.',
  },
  {
    id: 'diagnostics',
    label: 'Diagnostics',
    description: 'Warnings, evidence, difficulty breakdowns, and skim diffs.',
  },
  {
    id: 'info',
    label: 'Info',
    description: 'Glossary, workflow notes, and how to read the planner.',
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
  stats: Array<{ label: string; value: string }>;
  tabs: Array<{ id: AppView; label: string; active: boolean }>;
}

export function selectShellViewModel(state: AppState): ShellViewModel {
  const activeView =
    APP_VIEW_DEFINITIONS.find((view) => view.id === state.ui.activeView) ??
    APP_VIEW_DEFINITIONS[0];
  const warnings = state.snapshot.renderModel.warnings;
  return {
    activeView: activeView.id,
    activeDescription: activeView.description,
    banner: state.ui.banner,
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
    tabs: APP_VIEW_DEFINITIONS.map((view) => ({
      id: view.id,
      label: view.label,
      active: view.id === activeView.id,
    })),
  };
}
