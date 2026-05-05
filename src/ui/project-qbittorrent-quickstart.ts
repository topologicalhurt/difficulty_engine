import type { ProjectViewModel } from '../app/selectors/project';
import type { PlannerStore } from '../core/types';
import { button, el } from './dom';

export function renderQbittorrentQuickStart(
  viewModel: ProjectViewModel,
  store: PlannerStore,
): HTMLElement {
  const connection = viewModel.qbittorrentConnection;
  return el(
    'div',
    { className: 'source-subtree' },
    el('strong', { text: 'Quick start' }),
    el('div', {
      className: 'muted-copy',
      text: 'Run the local helper to open qBittorrent and start the browser bridge. The bridge only accepts browser requests from loopback origins by default; add your site or Obsidian origin with --allowed-origin when embedding elsewhere.',
    }),
    el('code', {
      className: 'inline-code',
      text: viewModel.qbittorrentLaunchCommand,
    }),
    el('code', {
      className: 'inline-code',
      text: viewModel.qbittorrentConfigureCommand,
    }),
    el(
      'div',
      { className: 'toolbar-row' },
      button('Prepare qBittorrent settings', {
        className: 'primary-button',
        onClick: () => store.commands.prepareQbittorrentQuickStart(),
      }),
      button('Copy launch command', {
        className: 'ghost-button',
        onClick: async () => {
          await navigator.clipboard.writeText(
            viewModel.qbittorrentLaunchCommand,
          );
          store.commands.setBanner({
            tone: 'success',
            message: 'qBittorrent launch command copied.',
          });
        },
      }),
      button('Copy enable command', {
        className: 'ghost-button',
        onClick: async () => {
          await navigator.clipboard.writeText(
            viewModel.qbittorrentConfigureCommand,
          );
          store.commands.setBanner({
            tone: 'success',
            message: 'qBittorrent Web UI enable command copied.',
          });
        },
      }),
      button('Open Web UI', {
        className: 'ghost-button',
        onClick: () => {
          window.open(connection.baseUrl, '_blank', 'noopener,noreferrer');
        },
      }),
    ),
  );
}
