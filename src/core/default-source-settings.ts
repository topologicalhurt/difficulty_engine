import type {
  QbittorrentConnectionSettings,
  QbittorrentRuntimeStatus,
  SourceSettings,
  SourceContentKind,
} from './types';

export const DEFAULT_QBITTORRENT_WEB_UI_URL = 'http://127.0.0.1:8080';
export const DEFAULT_QBITTORRENT_BRIDGE_URL = 'http://127.0.0.1:8787';
export const DEFAULT_DOCUMENT_DATA_ROOT = 'output/data/documents';
export const QBITTORRENT_OPEN_SOURCE_SITES = [
  'archive.org',
  'gutenberg.org',
  'standardebooks.org',
];
export const DEFAULT_CONTENT_PREFERENCE: SourceContentKind[] = [
  'text',
  'epub',
  'ocr_text',
  'pdf',
];

export function createDefaultSourceSettings(): SourceSettings {
  return {
    metadataSources: {
      openlibrary: true,
      googleBooks: true,
      internetArchive: true,
    },
    documentSources: {
      directUrl: true,
      localFile: true,
      internetArchiveText: true,
      qbittorrent: true,
    },
    qbittorrent: {
      userProvidedTorrents: true,
      searchPlugins: true,
      allowedPlugins: [],
      allowedSites: [...QBITTORRENT_OPEN_SOURCE_SITES],
      categories: ['all'],
      maxResults: 30,
      requireKnownAccessBasis: true,
    },
    contentPreference: [...DEFAULT_CONTENT_PREFERENCE],
  };
}

export function createDefaultQbittorrentConnectionSettings(): QbittorrentConnectionSettings {
  return {
    enabled: false,
    baseUrl: DEFAULT_QBITTORRENT_BRIDGE_URL,
    username: '',
    password: '',
    savePath: DEFAULT_DOCUMENT_DATA_ROOT,
    category: 'difficulty-engine',
    timeoutMs: 10000,
  };
}

export function createDefaultQbittorrentStatus(): QbittorrentRuntimeStatus {
  return {
    state: 'idle',
    message: 'qBittorrent is disabled.',
    plugins: [],
  };
}
