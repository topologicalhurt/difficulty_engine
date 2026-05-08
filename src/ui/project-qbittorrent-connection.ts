import type { ProjectViewModel } from '../app/selectors/project';
import type { PlannerStore } from '../core/types';
import { button, el } from './dom';
import { inputField } from './form-controls';
import {
  projectNumberInput,
  projectTextInput,
  sourceCheckbox,
} from './project-view-controls';

export function renderQbittorrentConnectionSettings(
  viewModel: ProjectViewModel,
  store: PlannerStore,
): HTMLElement[] {
  const connection = viewModel.qbittorrentConnection;
  const statusTone =
    viewModel.qbittorrentStatus.state === 'success'
      ? 'success'
      : viewModel.qbittorrentStatus.state === 'failed'
        ? 'warn'
        : viewModel.qbittorrentStatus.state === 'testing' ||
            viewModel.qbittorrentStatus.state === 'loading_plugins'
          ? 'info'
          : 'neutral';
  const updateConnection = (patch: Partial<typeof connection>): void =>
    store.commands.updateQbittorrentLocalSettings(patch);
  return [
    el(
      'div',
      { className: 'settings-grid' },
      sourceCheckbox(
        connection.enabled,
        'Enable qBittorrent connection',
        'Allows enrichment to contact the local qBittorrent browser bridge.',
        (checked) => updateConnection({ enabled: checked }),
      ),
      inputField(
        'Bridge API URL',
        projectTextInput(
          connection.baseUrl,
          (baseUrl) => updateConnection({ baseUrl }),
          'project:qbit:baseUrl',
          'http://127.0.0.1:8787',
        ),
      ),
      inputField(
        'Username',
        projectTextInput(
          connection.username,
          (username) => updateConnection({ username }),
          'project:qbit:username',
        ),
      ),
      inputField(
        'Password',
        projectTextInput(
          connection.password,
          (password) => updateConnection({ password }),
          'project:qbit:password',
          '',
          'password',
        ),
      ),
      inputField(
        'Save path',
        projectTextInput(
          connection.savePath,
          (savePath) => updateConnection({ savePath }),
          'project:qbit:savePath',
        ),
      ),
      inputField(
        'Category',
        projectTextInput(
          connection.category,
          (category) => updateConnection({ category }),
          'project:qbit:category',
        ),
      ),
      inputField(
        'Timeout ms',
        projectNumberInput(
          connection.timeoutMs,
          (timeoutMs) => updateConnection({ timeoutMs }),
          '1000',
          '120000',
          'project:qbit:timeoutMs',
        ),
      ),
    ),
    el(
      'div',
      { className: 'toolbar-row' },
      button('Test connection', {
        className: 'primary-button',
        onClick: () => void store.commands.testQbittorrentConnection(),
      }),
      button('Refresh plugins', {
        className: 'ghost-button',
        onClick: () => void store.commands.refreshQbittorrentPlugins(),
      }),
    ),
    el('div', {
      className: `status-callout status-callout-${statusTone}`,
      text: viewModel.qbittorrentStatus.message,
    }),
  ];
}
