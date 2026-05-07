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
import { authorAppearsInText, isbnAppearsInText } from '../core/matchers';
import { acquireTorrentDocument } from './qbittorrent-acquisition';
import {
  QBittorrentClient,
  settingsToOptions,
  type QBittorrentProviderOptions,
} from './qbittorrent-client';
import { pluginSearchCandidates } from './qbittorrent-plugin-search';
import { contentKindFromUrl } from './qbittorrent-file-kinds';
import {
  bookMatchScore,
  MIN_TORRENT_MATCH_SCORE,
} from './qbittorrent-selection';
import type { TorrentInfo } from './qbittorrent-types';

type QBittorrentProvider = DocumentAcquisitionProvider & {
  listPlugins(): Promise<QbittorrentPluginInfo[]>;
};

function isSafeUserProvidedTorrentSource(value: string): boolean {
  if (/^magnet:/i.test(value)) return true;
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === 'https:' && /\.torrent(?:$|\?)/i.test(parsed.pathname)
    );
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

function torrentEvidenceText(torrent: TorrentInfo): string {
  return [
    torrent.name,
    torrent.content_path,
    torrent.magnet_uri,
  ].join(' ');
}

function torrentHasRequiredAuthorEvidence(
  torrent: TorrentInfo,
  request: DocumentAcquisitionRequest,
): boolean {
  if (!request.book.authors.length) return true;
  const evidenceText = torrentEvidenceText(torrent);
  return (
    isbnAppearsInText(request.book.isbn, evidenceText) ||
    authorAppearsInText(request.book.authors, evidenceText)
  );
}

async function localTorrentCandidates(
  client: QBittorrentClient,
  request: DocumentAcquisitionRequest,
): Promise<DocumentCandidate[]> {
  await client.login();
  const torrents = await client.listTorrents();
  const category = client.torrentCategory();
  return torrents
    .filter((torrent) => torrent.category === category)
    .map((torrent): DocumentCandidate | null => {
      const title = torrent.name || torrent.content_path || request.book.title;
      const matchScore = bookMatchScore(title, request);
      if (matchScore < MIN_TORRENT_MATCH_SCORE) return null;
      if (!torrentHasRequiredAuthorEvidence(torrent, request)) return null;
      const sourceUrl =
        torrent.magnet_uri ||
        (torrent.hash ? `magnet:?xt=urn:btih:${torrent.hash}` : '');
      if (!sourceUrl) return null;
      const seeders = Math.max(0, torrent.num_seeds ?? 0);
      const peers = Math.max(0, torrent.num_leechs ?? 0);
      return {
        id: `qbittorrent-local:${request.book.id}:${torrent.hash ?? title}`,
        provider: 'qbittorrent',
        title,
        sourceUrl,
        contentKind: contentKindFromUrl(torrent.content_path || title),
        accessBasis: 'user_owned',
        confidence: Math.min(0.98, 0.55 + matchScore * 0.35),
        matchScore,
        seeders,
        peers,
        availability: {
          seeders,
          peers,
          progress: torrent.progress ?? 0,
          state: torrent.state ?? 'tracked',
        },
      };
    })
    .filter((candidate): candidate is DocumentCandidate => Boolean(candidate));
}

export function createQBittorrentProvider(
  options: QBittorrentProviderOptions,
): QBittorrentProvider {
  const client = new QBittorrentClient(options);
  return {
    id: 'qbittorrent',
    enabled: true,
    listPlugins: () => client.listPlugins(),
    async findCandidates(
      request: DocumentAcquisitionRequest,
    ): Promise<DocumentCandidate[]> {
      if (!qbittorrentDocumentSourceEnabled(request.policy.sourceSettings))
        return [];
      const candidates: DocumentCandidate[] = [];
      const manualCandidate = userProvidedTorrentCandidate(request);
      if (manualCandidate) candidates.push(manualCandidate);
      candidates.push(
        ...(await localTorrentCandidates(client, request).catch(() => [])),
      );
      if (qbittorrentSearchPluginsEnabled(request.policy.sourceSettings)) {
        candidates.push(...(await pluginSearchCandidates(client, request)));
      }
      return candidates.filter((candidate) =>
        isLawfulDocumentCandidate(candidate, request.policy),
      );
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
    async testConnection(
      settings: QbittorrentConnectionSettings,
    ): Promise<void> {
      await createQBittorrentProvider(
        settingsToOptions(settings, fetchImpl),
      ).listPlugins();
    },
    async listPlugins(
      settings: QbittorrentConnectionSettings,
    ): Promise<QbittorrentPluginInfo[]> {
      return createQBittorrentProvider(
        settingsToOptions(settings, fetchImpl),
      ).listPlugins();
    },
  };
}
