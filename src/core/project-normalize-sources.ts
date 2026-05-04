import {
  createDefaultQbittorrentConnectionSettings,
  createDefaultSourceSettings,
} from './defaults';
import type {
  DocumentSourceKey,
  MetadataSourceKey,
  QbittorrentConnectionSettings,
  SourceContentKind,
  SourceSettings,
} from './types';
import {
  normalizeBoolean,
  normalizeNumber,
  normalizeString,
  normalizeStringArray,
} from './project-normalize-primitives';

const METADATA_KEYS: MetadataSourceKey[] = ['openlibrary', 'googleBooks', 'internetArchive'];
const DOCUMENT_KEYS: DocumentSourceKey[] = ['directUrl', 'localFile', 'internetArchiveText', 'qbittorrent'];
const CONTENT_KINDS: SourceContentKind[] = ['text', 'epub', 'ocr_text', 'pdf'];

function normalizeMask<T extends string>(
  value: unknown,
  defaults: Record<T, boolean>,
  keys: T[],
): Record<T, boolean> {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return Object.fromEntries(
    keys.map((key) => [key, raw[key] == null ? defaults[key] : normalizeBoolean(raw[key])]),
  ) as Record<T, boolean>;
}

function normalizeContentPreference(value: unknown): SourceContentKind[] {
  const normalized = normalizeStringArray(value)
    .filter((entry): entry is SourceContentKind => CONTENT_KINDS.includes(entry as SourceContentKind));
  const ordered = [...new Set(normalized)];
  CONTENT_KINDS.forEach((kind) => {
    if (!ordered.includes(kind)) ordered.push(kind);
  });
  return ordered;
}

export function normalizeSourceSettings(value: unknown): SourceSettings {
  const defaults = createDefaultSourceSettings();
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const qbitRaw = raw.qbittorrent && typeof raw.qbittorrent === 'object'
    ? (raw.qbittorrent as Record<string, unknown>)
    : {};
  return {
    metadataSources: normalizeMask(raw.metadataSources, defaults.metadataSources, METADATA_KEYS),
    documentSources: normalizeMask(raw.documentSources, defaults.documentSources, DOCUMENT_KEYS),
    qbittorrent: {
      userProvidedTorrents:
        qbitRaw.userProvidedTorrents == null
          ? defaults.qbittorrent.userProvidedTorrents
          : normalizeBoolean(qbitRaw.userProvidedTorrents),
      searchPlugins:
        qbitRaw.searchPlugins == null
          ? defaults.qbittorrent.searchPlugins
          : normalizeBoolean(qbitRaw.searchPlugins),
      allowedPlugins: normalizeStringArray(qbitRaw.allowedPlugins),
      allowedSites: qbitRaw.allowedSites == null
        ? [...defaults.qbittorrent.allowedSites]
        : normalizeStringArray(qbitRaw.allowedSites).map((site) => normalizeString(site).toLowerCase()),
      categories: normalizeStringArray(qbitRaw.categories).length
        ? normalizeStringArray(qbitRaw.categories)
        : [...defaults.qbittorrent.categories],
      maxResults: normalizeNumber(qbitRaw.maxResults, defaults.qbittorrent.maxResults, 1, 50, true),
      requireKnownAccessBasis:
        qbitRaw.requireKnownAccessBasis == null
          ? defaults.qbittorrent.requireKnownAccessBasis
          : normalizeBoolean(qbitRaw.requireKnownAccessBasis),
    },
    contentPreference: normalizeContentPreference(raw.contentPreference),
  };
}

export function normalizeQbittorrentConnectionSettings(
  value: unknown,
): QbittorrentConnectionSettings {
  const defaults = createDefaultQbittorrentConnectionSettings();
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    enabled: raw.enabled == null ? defaults.enabled : normalizeBoolean(raw.enabled),
    baseUrl: normalizeString(raw.baseUrl, defaults.baseUrl) || defaults.baseUrl,
    username: normalizeString(raw.username),
    password: normalizeString(raw.password),
    savePath: normalizeString(raw.savePath, defaults.savePath) || defaults.savePath,
    category: normalizeString(raw.category, defaults.category) || defaults.category,
    timeoutMs: normalizeNumber(raw.timeoutMs, defaults.timeoutMs, 1000, 120000, true),
  };
}
