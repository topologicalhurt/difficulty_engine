import type {
  AcquiredDocument,
  DocumentAcquisitionProvider,
  DocumentAcquisitionRequest,
  DocumentCandidate,
} from './document-acquisition';
import { isLawfulDocumentCandidate } from './document-acquisition';
import type {
  QbittorrentConnectionSettings,
  QbittorrentIntegrationService,
  QbittorrentPluginInfo,
} from '../core/types';
import {
  qbittorrentDocumentSourceEnabled,
  qbittorrentSearchPluginsEnabled,
  qbittorrentUserTorrentsEnabled,
} from '../core/source-settings-policy';
import { acquireTorrentDocument } from './qbittorrent-acquisition';
import {
  QBittorrentClient,
  settingsToOptions,
  type QBittorrentProviderOptions,
} from './qbittorrent-client';
import { pluginSearchCandidates } from './qbittorrent-plugin-search';
import {
  contentKindFromUrl,
} from './qbittorrent-file-kinds';

type QBittorrentProvider = DocumentAcquisitionProvider & {
  listPlugins(): Promise<QbittorrentPluginInfo[]>;
};

function isSafeUserProvidedTorrentSource(value: string): boolean {
  if (/^magnet:/i.test(value)) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && /\.torrent(?:$|\?)/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

function userProvidedTorrentCandidate(
  request: DocumentAcquisitionRequest,
): DocumentCandidate | null {
  const sourcePath = request.book.sourcePath?.trim();
  if (
    !qbittorrentUserTorrentsEnabled(request.policy.sourceSettings) ||
    !sourcePath ||
    !isSafeUserProvidedTorrentSource(sourcePath)
  ) {
    return null;
  }
  return {
    id: `qbittorrent:${request.book.id}`,
    provider: 'qbittorrent',
    title: request.book.title,
    sourceUrl: sourcePath,
    contentKind: contentKindFromUrl(sourcePath),
    accessBasis: 'user_provided',
    matchScore: 1,
    confidence: 0.72,
  };
}

export function createQBittorrentProvider(options: QBittorrentProviderOptions): QBittorrentProvider {
  const client = new QBittorrentClient(options);
  return {
    id: 'qbittorrent',
    enabled: true,
    listPlugins: () => client.listPlugins(),
    async findCandidates(request: DocumentAcquisitionRequest): Promise<DocumentCandidate[]> {
      if (!qbittorrentDocumentSourceEnabled(request.policy.sourceSettings)) return [];
      const candidates: DocumentCandidate[] = [];
      const manualCandidate = userProvidedTorrentCandidate(request);
      if (manualCandidate) candidates.push(manualCandidate);
      if (qbittorrentSearchPluginsEnabled(request.policy.sourceSettings)) {
        candidates.push(...await pluginSearchCandidates(client, request));
      }
      return candidates.filter((candidate) => isLawfulDocumentCandidate(candidate, request.policy));
    },
    async acquire(
      candidate: DocumentCandidate,
      request: DocumentAcquisitionRequest,
    ): Promise<AcquiredDocument | null> {
      return acquireTorrentDocument(client, candidate, request);
    },
  };
}

export function createQBittorrentIntegrationService(
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
): QbittorrentIntegrationService {
  return {
    async testConnection(settings: QbittorrentConnectionSettings): Promise<void> {
      await createQBittorrentProvider(settingsToOptions(settings, fetchImpl)).listPlugins();
    },
    async listPlugins(settings: QbittorrentConnectionSettings): Promise<QbittorrentPluginInfo[]> {
      return createQBittorrentProvider(settingsToOptions(settings, fetchImpl)).listPlugins();
    },
  };
}
