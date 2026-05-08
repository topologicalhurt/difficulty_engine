import type { ProjectViewModel } from '../app/selectors/project';
import type { PlannerStore } from '../core/types';
import { el } from './dom';
import { inputField } from './form-controls';
import { parseCsv } from './format';
import {
  projectNumberInput,
  projectTextInput,
  sourceCheckbox,
} from './project-view-controls';

export function renderQbittorrentSourceSettings(
  viewModel: ProjectViewModel,
  store: PlannerStore,
): HTMLElement {
  const qbit = viewModel.sourceSettings.qbittorrent;
  const updateQbit = (patch: Partial<typeof qbit>): void =>
    store.commands.updateSourceSettings({ qbittorrent: { ...qbit, ...patch } });
  return el(
    'div',
    { className: 'source-subtree' },
    sourceCheckbox(
      qbit.userProvidedTorrents,
      'User-provided magnets/torrents',
      'Use only magnet/torrent URLs entered on a book.',
      (checked) => updateQbit({ userProvidedTorrents: checked }),
    ),
    sourceCheckbox(
      qbit.searchPlugins,
      'Search plugins',
      'Search by ISBN first when available, then precise title/author terms; only whitelisted plugins/sites are accepted.',
      (checked) => updateQbit({ searchPlugins: checked }),
    ),
    sourceCheckbox(
      qbit.requireKnownAccessBasis,
      'Require known legal/access basis',
      'Reject plugin results unless each result exposes a known legal/access basis.',
      (checked) => updateQbit({ requireKnownAccessBasis: checked }),
    ),
    inputField(
      'Allowed sites',
      projectTextInput(
        qbit.allowedSites.join(', '),
        (value) => updateQbit({ allowedSites: parseCsv(value) }),
        'project:qbit:allowedSites',
        'example.org, archive.org',
      ),
    ),
    inputField(
      'Categories',
      projectTextInput(
        qbit.categories.join(', '),
        (value) => updateQbit({ categories: parseCsv(value) }),
        'project:qbit:categories',
        'all',
      ),
    ),
    inputField(
      'Max results per search',
      projectNumberInput(
        qbit.maxResults,
        (maxResults) => updateQbit({ maxResults }),
        '1',
        '150',
        'project:qbit:maxResults',
      ),
    ),
    el(
      'div',
      { className: 'stack-layout compact-stack' },
      el('strong', { text: 'Search plugin whitelist' }),
      viewModel.qbittorrentStatus.plugins.length
        ? el(
            'div',
            { className: 'stack-list compact-stack' },
            ...viewModel.qbittorrentStatus.plugins.map((plugin) =>
              sourceCheckbox(
                qbit.allowedPlugins.includes(plugin.name),
                plugin.fullName || plugin.name,
                plugin.url || 'Installed qBittorrent search plugin.',
                (checked) =>
                  store.commands.setQbittorrentPluginEnabled(
                    plugin.name,
                    checked,
                  ),
              ),
            ),
          )
        : el('div', {
            className: 'muted-copy',
            text: 'Refresh plugins after the connection succeeds.',
          }),
    ),
  );
}
