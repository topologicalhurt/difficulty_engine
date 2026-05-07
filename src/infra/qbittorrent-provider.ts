import type {
  AcquiredDocument,
  DocumentAcquisitionProvider,
  DocumentAcquisitionRequest,
  DocumentCandidate,
} from './document-acquisition';
import {
  defaultDocumentAcquisitionPolicy,
  isLawfulDocumentCandidate,
  rankDocumentCandidates,
} from './document-acquisition';
import type {
  QbittorrentConnectionSettings,
  QbittorrentIntegrationService,
  QbittorrentPluginInfo,
  BookDocumentCandidateOption,
  EnrichmentRequest,
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
  torrentAvailability,
} from './qbittorrent-selection';
import { documentCandidateQualityScore } from './document-candidate-quality';
import { contentKindPriorityForPreference } from './document-content-priority';
import type { TorrentInfo } from './qbittorrent-types';

type QBittorrentProvider = DocumentAcquisitionProvider & {
  listPlugins(): Promise<QbittorrentPluginInfo[]>;
  deleteTorrent(hash: string, deleteFiles: boolean): Promise<void>;
};

function candidateOption(
  candidate: DocumentCandidate,
): BookDocumentCandidateOption {
  return {
    id: candidate.id,
    provider: candidate.provider,
    title: candidate.title,
    sourceUrl: candidate.sourceUrl,
    contentKind: candidate.contentKind,
    accessBasis: candidate.accessBasis,
    confidence: candidate.confidence,
    sizeBytes: candidate.sizeBytes,
    seeders: candidate.seeders,
    peers: candidate.peers,
    matchScore: candidate.matchScore,
    qualityScore: candidate.qualityScore,
    qualityReason: candidate.qualityReason,
    greylistKey: candidate.greylistKey,
    greylistPenalty: candidate.greylistPenalty,
    greylistReason: candidate.greylistReason,
    rank: candidate.rank,
    retryable: candidate.retryable,
    queuedAt: candidate.queuedAt,
    lastSeenAt: candidate.lastSeenAt,
    availability: candidate.availability,
  };
}

function optionCandidate(option: BookDocumentCandidateOption): DocumentCandidate {
  return {
    id: option.id,
    provider: option.provider,
    title: option.title,
    sourceUrl: option.sourceUrl,
    contentKind: option.contentKind,
    accessBasis: option.accessBasis,
    confidence: option.confidence,
    sizeBytes: option.sizeBytes,
    seeders: option.seeders,
    peers: option.peers,
    matchScore: option.matchScore,
    qualityScore: option.qualityScore,
    qualityReason: option.qualityReason,
    greylistKey: option.greylistKey,
    greylistPenalty: option.greylistPenalty,
    greylistReason: option.greylistReason,
    rank: option.rank,
    retryable: option.retryable,
    queuedAt: option.queuedAt,
    lastSeenAt: option.lastSeenAt,
    availability: option.availability,
  };
}

function acquisitionRequest(
  request: EnrichmentRequest,
  settings: QbittorrentConnectionSettings,
): DocumentAcquisitionRequest {
  return {
    book: request.book,
    signal: request.signal,
    policy: {
      ...defaultDocumentAcquisitionPolicy(),
      enabled: true,
      dataRoot: settings.savePath,
      contentPreference: request.sourceSettings.contentPreference,
      sourceSettings: request.sourceSettings,
    },
  };
}

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
      const availability = torrentAvailability(torrent);
      const candidate = {
        id: `qbittorrent-local:${request.book.id}:${torrent.hash ?? title}`,
        provider: 'qbittorrent',
        title,
        sourceUrl,
        contentKind: contentKindFromUrl(torrent.content_path || title),
        accessBasis: 'user_owned' as const,
        confidence: Math.min(0.98, 0.55 + matchScore * 0.35),
        matchScore,
        seeders: availability.seeders,
        peers: availability.peers,
        sizeBytes: availability.sizeBytes ?? undefined,
        qualityReason:
          availability.etaSeconds != null
            ? `${availability.seeders ?? 0} seeder(s), ETA ${Math.round(
                availability.etaSeconds / 60,
              )}m.`
            : `${availability.seeders ?? 0} seeder(s), ${Math.round(
                availability.progress * 100,
              )}% tracked.`,
        availability,
      };
      return {
        ...candidate,
        qualityScore: documentCandidateQualityScore(
          candidate,
          contentKindPriorityForPreference(request.policy.contentPreference),
        ),
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
    async deleteTorrent(hash, deleteFiles) {
      await client.login();
      await client.deleteTorrent(hash, deleteFiles);
    },
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
      const priorityFor = contentKindPriorityForPreference(
        request.policy.contentPreference,
      );
      const scoredCandidates = candidates
        .filter((candidate) =>
          isLawfulDocumentCandidate(candidate, request.policy),
        )
        .map((candidate) => ({
          ...candidate,
          qualityScore:
            candidate.qualityScore ??
            documentCandidateQualityScore(candidate, priorityFor),
        }));
      return rankDocumentCandidates(
        scoredCandidates,
        request.policy,
        request.book.documentAcquisition,
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
    async findDocumentCandidates(
      settings: QbittorrentConnectionSettings,
      request: EnrichmentRequest,
    ): Promise<BookDocumentCandidateOption[]> {
      const provider = createQBittorrentProvider(
        settingsToOptions(settings, fetchImpl),
      );
      return (
        await provider.findCandidates(acquisitionRequest(request, settings))
      ).map(candidateOption);
    },
    async acquireDocumentCandidate(
      settings: QbittorrentConnectionSettings,
      request: EnrichmentRequest,
      candidateId: string,
      candidates: BookDocumentCandidateOption[],
    ) {
      const option = candidates.find((candidate) => candidate.id === candidateId);
      if (!option) return null;
      const provider = createQBittorrentProvider(
        settingsToOptions(settings, fetchImpl),
      );
      const acquired = await provider.acquire(
        optionCandidate(option),
        acquisitionRequest(request, settings),
      );
      return acquired?.documentRef ?? null;
    },
    async deleteTorrent(
      settings: QbittorrentConnectionSettings,
      hash: string,
      deleteFiles: boolean,
    ): Promise<void> {
      const provider = createQBittorrentProvider(
        settingsToOptions(settings, fetchImpl),
      );
      await provider.deleteTorrent(hash, deleteFiles);
    },
  };
}
