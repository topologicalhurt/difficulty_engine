import {
  DEFAULT_QBITTORRENT_BRIDGE_URL,
  QBITTORRENT_OPEN_SOURCE_SITES,
} from '../core/defaults';
import { normalizeQbittorrentConnectionSettings } from '../core/project-normalize-sources';
import type {
  CreatePlannerStoreOptions,
  PlannerStoreCommands,
  QbittorrentBridgeHealth,
  QbittorrentConnectionSettings,
} from '../core/types';
import type { StoreCommandContext } from './store-command-context';
import { createStoreRequestSequencer } from './store-request-sequencer';
import {
  applySourceSettingsPatch,
  commitQbittorrentConnectionPatch,
} from './store-source-settings-helpers';

export function createQbittorrentCommands(
  context: StoreCommandContext,
  services: CreatePlannerStoreOptions,
): Pick<
  PlannerStoreCommands,
  | 'updateQbittorrentLocalSettings'
  | 'prepareQbittorrentQuickStart'
  | 'testQbittorrentConnection'
  | 'refreshQbittorrentPlugins'
  | 'setQbittorrentPluginEnabled'
> {
  const requests = createStoreRequestSequencer();
  const connectionFingerprint = (
    settings: QbittorrentConnectionSettings,
  ): string => JSON.stringify(normalizeQbittorrentConnectionSettings(settings));
  const requestIsCurrent = (sequence: number, fingerprint: string): boolean =>
    requests.isCurrent(sequence) &&
    connectionFingerprint(context.getState().ui.qbittorrentConnection) ===
      fingerprint;
  const bridgeFailureMessage = (health: QbittorrentBridgeHealth): string => {
    if (health.status === 'ok') return 'qBittorrent connection succeeded.';
    return health.message;
  };

  return {
    updateQbittorrentLocalSettings(patch): void {
      requests.invalidate();
      commitQbittorrentConnectionPatch(context, services, patch);
    },
    prepareQbittorrentQuickStart(): void {
      requests.invalidate();
      const state = context.getState();
      const nextConnection = normalizeQbittorrentConnectionSettings({
        ...state.ui.qbittorrentConnection,
        enabled: true,
        baseUrl: DEFAULT_QBITTORRENT_BRIDGE_URL,
      });
      const currentQbit = state.project.sourceSettings.qbittorrent;
      const allowedSites = Array.from(
        new Set([
          ...currentQbit.allowedSites,
          ...QBITTORRENT_OPEN_SOURCE_SITES,
        ]),
      ).sort();
      services.localSettings?.saveQbittorrentConnection(nextConnection);
      context.commitProject(
        'project.qbittorrentQuickStart',
        applySourceSettingsPatch(state.project, {
          documentSources: {
            ...state.project.sourceSettings.documentSources,
            qbittorrent: true,
          },
          qbittorrent: {
            ...currentQbit,
            userProvidedTorrents: true,
            searchPlugins: true,
            allowedSites,
            requireKnownAccessBasis: true,
          },
        }),
        {
          qbittorrentConnection: nextConnection,
          qbittorrentStatus: {
            ...state.ui.qbittorrentStatus,
            state: 'idle',
            message:
              'qBittorrent quick-start enabled. Launch qBittorrent, test the connection, then refresh plugins.',
          },
          banner: {
            tone: 'success',
            message:
              'qBittorrent enabled: local bridge URL set, document acquisition enabled, open-source sites allow-listed, and plugin search enabled.',
          },
        },
      );
    },
    async testQbittorrentConnection(): Promise<boolean> {
      const state = context.getState();
      const connection = state.ui.qbittorrentConnection;
      if (!connection.enabled) {
        context.commitUi('project.qbittorrentTest', {
          qbittorrentStatus: {
            ...state.ui.qbittorrentStatus,
            state: 'failed',
            message:
              'qBittorrent is disabled. Enable the connection before testing.',
          },
          banner: {
            tone: 'warn',
            message:
              'qBittorrent connection test skipped because the integration is disabled.',
          },
        });
        return false;
      }
      const sequence = requests.begin();
      const fingerprint = connectionFingerprint(connection);
      context.commitUi('project.qbittorrentTest', {
        qbittorrentStatus: {
          ...state.ui.qbittorrentStatus,
          state: 'testing',
          message: 'Testing qBittorrent connection...',
        },
      });
      try {
        if (!services.qbittorrentService) {
          throw new Error(
            'qBittorrent integration is not available in this host.',
          );
        }
        const health =
          await services.qbittorrentService.checkBridgeHealth?.(connection);
        if (health && health.status !== 'ok') {
          if (!requestIsCurrent(sequence, fingerprint)) return false;
          context.commitUi('project.qbittorrentTest', {
            qbittorrentStatus: {
              ...context.getState().ui.qbittorrentStatus,
              state: 'failed',
              message: bridgeFailureMessage(health),
            },
            banner: {
              tone: 'error',
              message: bridgeFailureMessage(health),
            },
          });
          return false;
        }
        await services.qbittorrentService.testConnection(connection);
        if (!requestIsCurrent(sequence, fingerprint)) return false;
        context.commitUi('project.qbittorrentTest', {
          qbittorrentStatus: {
            ...context.getState().ui.qbittorrentStatus,
            state: 'success',
            message: 'qBittorrent connection succeeded.',
          },
          banner: {
            tone: 'success',
            message: 'qBittorrent connection succeeded.',
          },
        });
        return true;
      } catch (error) {
        if (!requestIsCurrent(sequence, fingerprint)) return false;
        context.commitUi('project.qbittorrentTest', {
          qbittorrentStatus: {
            ...context.getState().ui.qbittorrentStatus,
            state: 'failed',
            message:
              error instanceof Error
                ? error.message
                : 'qBittorrent connection failed.',
          },
          banner: {
            tone: 'error',
            message:
              error instanceof Error
                ? error.message
                : 'qBittorrent connection failed.',
          },
        });
        return false;
      }
    },
    async refreshQbittorrentPlugins(): Promise<void> {
      const state = context.getState();
      const connection = state.ui.qbittorrentConnection;
      if (!connection.enabled) {
        context.commitUi('project.qbittorrentPlugins', {
          qbittorrentStatus: {
            ...state.ui.qbittorrentStatus,
            state: 'failed',
            message:
              'qBittorrent is disabled. Enable the connection before loading plugins.',
          },
          banner: {
            tone: 'warn',
            message:
              'qBittorrent plugin refresh skipped because the integration is disabled.',
          },
        });
        return;
      }
      const sequence = requests.begin();
      const fingerprint = connectionFingerprint(connection);
      context.commitUi('project.qbittorrentPlugins', {
        qbittorrentStatus: {
          ...state.ui.qbittorrentStatus,
          state: 'loading_plugins',
          message: 'Loading qBittorrent search plugins...',
        },
      });
      try {
        if (!services.qbittorrentService) {
          throw new Error(
            'qBittorrent integration is not available in this host.',
          );
        }
        const plugins =
          await services.qbittorrentService.listPlugins(connection);
        if (!requestIsCurrent(sequence, fingerprint)) return;
        context.commitUi('project.qbittorrentPlugins', {
          qbittorrentStatus: {
            state: 'success',
            message: `${plugins.length} qBittorrent plugin(s) loaded.`,
            plugins,
          },
        });
      } catch (error) {
        if (!requestIsCurrent(sequence, fingerprint)) return;
        context.commitUi('project.qbittorrentPlugins', {
          qbittorrentStatus: {
            ...context.getState().ui.qbittorrentStatus,
            state: 'failed',
            message:
              error instanceof Error
                ? error.message
                : 'Could not load qBittorrent plugins.',
          },
        });
      }
    },
    setQbittorrentPluginEnabled(pluginName: string, enabled: boolean): void {
      const state = context.getState();
      const current = new Set(
        state.project.sourceSettings.qbittorrent.allowedPlugins,
      );
      if (enabled) current.add(pluginName);
      else current.delete(pluginName);
      context.commitProject(
        'project.qbittorrentPlugin',
        applySourceSettingsPatch(state.project, {
          qbittorrent: {
            ...state.project.sourceSettings.qbittorrent,
            allowedPlugins: [...current].sort(),
          },
        }),
        {
          banner: {
            tone: 'success',
            message: 'qBittorrent plugin source mask updated.',
          },
        },
      );
    },
  };
}
