import type { ProjectViewModel } from '../app/selectors/project';
import type { PlannerStore } from '../core/types';
import { card, el } from './dom';
import { renderQbittorrentConnectionSettings } from './project-qbittorrent-connection';
import { renderQbittorrentQuickStart } from './project-qbittorrent-quickstart';
import { renderQbittorrentSourceSettings } from './project-qbittorrent-sources';

export function renderQbittorrentCard(
  viewModel: ProjectViewModel,
  store: PlannerStore,
): HTMLElement {
  return card(
    'qBittorrent',
    el('p', {
      className: 'muted-copy',
      text: 'Connection details are stored locally in this browser and are never exported. The password is kept in memory for this session only. Search plugins are only used when explicitly enabled and whitelisted.',
    }),
    renderQbittorrentQuickStart(viewModel, store),
    ...renderQbittorrentConnectionSettings(viewModel, store),
    renderQbittorrentSourceSettings(viewModel, store),
  );
}
