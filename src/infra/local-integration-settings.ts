import type { LocalIntegrationSettingsAdapter, QbittorrentConnectionSettings } from '../core/types';
import { normalizeQbittorrentConnectionSettings } from '../core/project-normalize-sources';
import {
  DEFAULT_QBITTORRENT_BRIDGE_URL,
  DEFAULT_QBITTORRENT_WEB_UI_URL,
} from '../core/defaults';

const QBITTORRENT_KEY = 'qbittorrentConnection';

export function createLocalIntegrationSettings(storageKey: string): LocalIntegrationSettingsAdapter {
  function readRoot(): Record<string, unknown> {
    try {
      return JSON.parse(globalThis.localStorage?.getItem(storageKey) ?? '{}') as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  function writeRoot(value: Record<string, unknown>): void {
    globalThis.localStorage?.setItem(storageKey, JSON.stringify(value));
  }

  return {
    loadQbittorrentConnection(): QbittorrentConnectionSettings | undefined {
      const root = readRoot();
      if (!root[QBITTORRENT_KEY]) return undefined;
      const settings = normalizeQbittorrentConnectionSettings(root[QBITTORRENT_KEY]);
      return settings.baseUrl === DEFAULT_QBITTORRENT_WEB_UI_URL
        ? { ...settings, baseUrl: DEFAULT_QBITTORRENT_BRIDGE_URL }
        : settings;
    },
    saveQbittorrentConnection(settings: QbittorrentConnectionSettings): void {
      const normalized = normalizeQbittorrentConnectionSettings(settings);
      writeRoot({
        ...readRoot(),
        [QBITTORRENT_KEY]: {
          ...normalized,
          password: '',
        },
      });
    },
  };
}
