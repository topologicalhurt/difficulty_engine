import type { ProjectViewModel } from '../app/selectors/project';
import type { PlannerStore } from '../core/types';
import { button, card, el, inputField } from './dom';
import { projectNumberInput, projectTextInput, sourceCheckbox } from './project-view-controls';

export function renderQbittorrentCard(viewModel: ProjectViewModel, store: PlannerStore): HTMLElement {
  const connection = viewModel.qbittorrentConnection;
  const qbit = viewModel.sourceSettings.qbittorrent;
  const updateConnection = (patch: Partial<typeof connection>): void => store.commands.updateQbittorrentLocalSettings(patch);
  const updateQbit = (patch: Partial<typeof qbit>): void =>
    store.commands.updateSourceSettings({ qbittorrent: { ...qbit, ...patch } });
  return card(
    'qBittorrent',
    el('p', {
      className: 'muted-copy',
      text: 'Connection details are stored locally in this browser and are never exported. The password is kept in memory for this session only. Search plugins are only used when explicitly enabled and whitelisted.',
    }),
    el(
      'div',
      { className: 'source-subtree' },
      el('strong', { text: 'Quick start' }),
      el('div', {
        className: 'muted-copy',
        text: 'Run the local helper to open qBittorrent and start the browser bridge. The bridge only accepts browser requests from loopback origins by default; add your site or Obsidian origin with --allowed-origin when embedding elsewhere.',
      }),
      el('code', { className: 'inline-code', text: viewModel.qbittorrentLaunchCommand }),
      el('code', { className: 'inline-code', text: viewModel.qbittorrentConfigureCommand }),
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
            await navigator.clipboard.writeText(viewModel.qbittorrentLaunchCommand);
            store.commands.setBanner({ tone: 'success', message: 'qBittorrent launch command copied.' });
          },
        }),
        button('Copy enable command', {
          className: 'ghost-button',
          onClick: async () => {
            await navigator.clipboard.writeText(viewModel.qbittorrentConfigureCommand);
            store.commands.setBanner({ tone: 'success', message: 'qBittorrent Web UI enable command copied.' });
          },
        }),
        button('Open Web UI', {
          className: 'ghost-button',
          onClick: () => {
            window.open(connection.baseUrl, '_blank', 'noopener,noreferrer');
          },
        }),
      ),
    ),
    el(
      'div',
      { className: 'settings-grid' },
      sourceCheckbox(connection.enabled, 'Enable qBittorrent connection', 'Allows enrichment to contact the local qBittorrent browser bridge.', (checked) => updateConnection({ enabled: checked })),
      inputField('Bridge API URL', projectTextInput(connection.baseUrl, (baseUrl) => updateConnection({ baseUrl }), 'http://127.0.0.1:8787')),
      inputField('Username', projectTextInput(connection.username, (username) => updateConnection({ username }))),
      inputField('Password', projectTextInput(connection.password, (password) => updateConnection({ password }), '', 'password')),
      inputField('Save path', projectTextInput(connection.savePath, (savePath) => updateConnection({ savePath }))),
      inputField('Category', projectTextInput(connection.category, (category) => updateConnection({ category }))),
      inputField('Timeout ms', projectNumberInput(connection.timeoutMs, (timeoutMs) => updateConnection({ timeoutMs }), '1000', '120000')),
    ),
    el(
      'div',
      { className: 'toolbar-row' },
      button('Test connection', { className: 'primary-button', onClick: () => void store.commands.testQbittorrentConnection() }),
      button('Refresh plugins', { className: 'ghost-button', onClick: () => void store.commands.refreshQbittorrentPlugins() }),
    ),
    el('div', { className: 'muted-copy', text: viewModel.qbittorrentStatus.message }),
    el(
      'div',
      { className: 'source-subtree' },
      sourceCheckbox(qbit.userProvidedTorrents, 'User-provided magnets/torrents', 'Use only magnet/torrent URLs entered on a book.', (checked) => updateQbit({ userProvidedTorrents: checked })),
      sourceCheckbox(qbit.searchPlugins, 'Search plugins', 'Search by ISBN first when available, then precise title/author terms; only whitelisted plugins/sites are accepted.', (checked) => updateQbit({ searchPlugins: checked })),
      sourceCheckbox(qbit.requireKnownAccessBasis, 'Require known legal/access basis', 'Reject plugin results unless the plugin or site is explicitly whitelisted.', (checked) => updateQbit({ requireKnownAccessBasis: checked })),
      inputField('Allowed sites', projectTextInput(qbit.allowedSites.join(', '), (value) => updateQbit({ allowedSites: value.split(',').map((item) => item.trim()).filter(Boolean) }), 'example.org, archive.org')),
      inputField('Categories', projectTextInput(qbit.categories.join(', '), (value) => updateQbit({ categories: value.split(',').map((item) => item.trim()).filter(Boolean) }), 'all')),
      inputField('Max results per plugin', projectNumberInput(qbit.maxResults, (maxResults) => updateQbit({ maxResults }), '1', '50')),
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
                  (checked) => store.commands.setQbittorrentPluginEnabled(plugin.name, checked),
                ),
              ),
            )
          : el('div', { className: 'muted-copy', text: 'Refresh plugins after the connection succeeds.' }),
      ),
    ),
  );
}
