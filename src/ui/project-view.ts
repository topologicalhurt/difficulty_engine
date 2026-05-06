import { selectProjectViewModel } from '../app/selectors/project';
import type { AppState, PlannerStore } from '../core/types';
import { el } from './dom';
import { renderImportExportCard } from './project-import-export-card';
import { renderQbittorrentCard } from './project-qbittorrent-card';
import { renderSourceProvidersCard } from './project-source-providers-card';

export function renderProjectView(
  state: AppState,
  store: PlannerStore,
): HTMLElement {
  const viewModel = selectProjectViewModel(state);
  return el(
    'div',
    { className: 'stack-layout' },
    renderImportExportCard(viewModel, store),
    renderSourceProvidersCard(viewModel, store),
    renderQbittorrentCard(viewModel, store),
  );
}
