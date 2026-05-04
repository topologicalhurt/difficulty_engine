import {
  DEFAULT_QBITTORRENT_BRIDGE_URL,
  QBITTORRENT_OPEN_SOURCE_SITES,
} from '../core/defaults';
import { normalizeQbittorrentConnectionSettings } from '../core/project-normalize-sources';
import type { CreatePlannerStoreOptions, PlannerStoreCommands } from '../core/types';
import type { StoreCommandContext } from './store-command-context';
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
  return {
    updateQbittorrentLocalSettings(patch): void {
      commitQbittorrentConnectionPatch(context, services, patch);
    },
    prepareQbittorrentQuickStart(): void {
      const state = context.getState();
      const nextConnection = normalizeQbittorrentConnectionSettings({
        ...state.ui.qbittorrentConnection,
        enabled: true,
        baseUrl: DEFAULT_QBITTORRENT_BRIDGE_URL,
      });
      const currentQbit = state.project.sourceSettings.qbittorrent;
      const allowedSites = Array.from(
        new Set([...currentQbit.allowedSites, ...QBITTORRENT_OPEN_SOURCE_SITES]),
      ).sort();
      services.localSettings?.saveQbittorrentConnection(nextConnection);
      context.commitProject('project.qbittorrentQuickStart', applySourceSettingsPatch(state.project, {
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
      }), {
        qbittorrentConnection: nextConnection,
        qbittorrentStatus: {
          ...state.ui.qbittorrentStatus,
          state: 'idle',
          message: 'qBittorrent quick-start enabled. Launch qBittorrent, test the connection, then refresh plugins.',
        },
        banner: {
          tone: 'success',
          message: 'qBittorrent quick-start settings enabled.',
        },
      });
    },
    async testQbittorrentConnection(): Promise<void> {
      const state = context.getState();
      context.commitUi('project.qbittorrentTest', {
        qbittorrentStatus: {
          ...state.ui.qbittorrentStatus,
          state: 'testing',
          message: 'Testing qBittorrent connection...',
        },
      });
      try {
        if (!services.qbittorrentService) {
          throw new Error('qBittorrent integration is not available in this host.');
        }
        await services.qbittorrentService.testConnection(state.ui.qbittorrentConnection);
        context.commitUi('project.qbittorrentTest', {
          qbittorrentStatus: {
            ...context.getState().ui.qbittorrentStatus,
            state: 'success',
            message: 'qBittorrent connection succeeded.',
          },
          banner: { tone: 'success', message: 'qBittorrent connection succeeded.' },
        });
      } catch (error) {
        context.commitUi('project.qbittorrentTest', {
          qbittorrentStatus: {
            ...context.getState().ui.qbittorrentStatus,
            state: 'failed',
            message: error instanceof Error ? error.message : 'qBittorrent connection failed.',
          },
          banner: {
            tone: 'error',
            message: error instanceof Error ? error.message : 'qBittorrent connection failed.',
          },
        });
      }
    },
    async refreshQbittorrentPlugins(): Promise<void> {
      const state = context.getState();
      context.commitUi('project.qbittorrentPlugins', {
        qbittorrentStatus: {
          ...state.ui.qbittorrentStatus,
          state: 'loading_plugins',
          message: 'Loading qBittorrent search plugins...',
        },
      });
      try {
        if (!services.qbittorrentService) {
          throw new Error('qBittorrent integration is not available in this host.');
        }
        const plugins = await services.qbittorrentService.listPlugins(state.ui.qbittorrentConnection);
        context.commitUi('project.qbittorrentPlugins', {
          qbittorrentStatus: {
            state: 'success',
            message: `${plugins.length} qBittorrent plugin(s) loaded.`,
            plugins,
          },
        });
      } catch (error) {
        context.commitUi('project.qbittorrentPlugins', {
          qbittorrentStatus: {
            ...context.getState().ui.qbittorrentStatus,
            state: 'failed',
            message: error instanceof Error ? error.message : 'Could not load qBittorrent plugins.',
          },
        });
      }
    },
    setQbittorrentPluginEnabled(pluginName: string, enabled: boolean): void {
      const state = context.getState();
      const current = new Set(state.project.sourceSettings.qbittorrent.allowedPlugins);
      if (enabled) current.add(pluginName);
      else current.delete(pluginName);
      context.commitProject('project.qbittorrentPlugin', applySourceSettingsPatch(state.project, {
        qbittorrent: {
          ...state.project.sourceSettings.qbittorrent,
          allowedPlugins: [...current].sort(),
        },
      }), {
        banner: { tone: 'success', message: 'qBittorrent plugin source mask updated.' },
      });
    },
  };
}
