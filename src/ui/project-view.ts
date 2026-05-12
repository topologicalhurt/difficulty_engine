import { selectProjectViewModel } from '../app/selectors/project';
import type { AppState, PlannerStore } from '../core/types';
import { el } from './dom';
import { renderImportExportCard } from './project-import-export-card';
import { renderAutopilotCard } from './project-autopilot-card';
import { renderQbittorrentCard } from './project-qbittorrent-card';
import { renderProjectReadingScopeCard } from './project-reading-scope-card';
import { renderSourceProvidersCard } from './project-source-providers-card';

export function renderProjectView(
  state: AppState,
  store: PlannerStore,
): HTMLElement {
  const viewModel = selectProjectViewModel(state);
  return el(
    'div',
    { className: 'stack-layout' },
    renderAutopilotCard(state, store),
    renderProjectReadingScopeCard(viewModel, store),
    renderImportExportCard(viewModel, store),
    renderSourceProvidersCard(viewModel, store),
    renderQbittorrentCard(viewModel, store),
  );
}
