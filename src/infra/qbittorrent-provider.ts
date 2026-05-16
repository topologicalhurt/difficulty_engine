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
  BookDocumentBlockedCandidateOption,
  BookDocumentSearchAttempt,
  EnrichmentRequest,
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
import { checkQbittorrentBridgeHealth } from './qbittorrent-bridge-health';
import { pluginSearchCandidates } from './qbittorrent-plugin-search';
import { contentKindFromUrl } from './qbittorrent-file-kinds';
import {
  compareDocumentCandidateQuality,
  documentCandidateQualityScore,
} from './document-candidate-quality';
import { contentKindPriorityForPreference } from './document-content-priority';
import {
  candidateFromLiveTorrent,
  readQbittorrentLiveInventory,
} from './qbittorrent-live-inventory';

type QBittorrentProvider = DocumentAcquisitionProvider & {
  listPlugins(): Promise<QbittorrentPluginInfo[]>;
  findCandidateSearch(
    request: DocumentAcquisitionRequest,
    customQuery?: string,
  ): Promise<{
    candidates: DocumentCandidate[];
    blockedCandidates: BookDocumentBlockedCandidateOption[];
    searchAttempts: BookDocumentSearchAttempt[];
  }>;
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
    searchAvailability: candidate.searchAvailability,
    availabilitySource: candidate.availabilitySource,
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

function optionCandidate(
  option: BookDocumentCandidateOption,
): DocumentCandidate {
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
    searchAvailability: option.searchAvailability,
    availabilitySource: option.availabilitySource,
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

async function localTorrentCandidates(
  client: QBittorrentClient,
  request: DocumentAcquisitionRequest,
  preferredCategory?: string,
): Promise<DocumentCandidate[]> {
  const inventory = await readQbittorrentLiveInventory(client);
  const priorityFor = contentKindPriorityForPreference(
    request.policy.contentPreference,
  );
  const byIdentity = new Map<
    string,
    {
      candidate: DocumentCandidate;
      categoryMatches: boolean;
    }
  >();
  inventory.torrents.forEach((torrent) => {
    const candidate = candidateFromLiveTorrent(torrent, request);
    if (!candidate) return;
    const key = `${candidate.provider}|${candidate.contentKind}|${candidate.title.toLowerCase()}`;
    const categoryMatches = Boolean(
      preferredCategory && torrent.category === preferredCategory,
    );
    const previous = byIdentity.get(key);
    if (
      !previous ||
      Number(categoryMatches) - Number(previous.categoryMatches) > 0 ||
      (categoryMatches === previous.categoryMatches &&
        compareDocumentCandidateQuality(
          candidate,
          previous.candidate,
          priorityFor,
        ) < 0)
    ) {
      byIdentity.set(key, { candidate, categoryMatches });
    }
  });
  return [...byIdentity.values()].map((entry) => entry.candidate);
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
        ...(await localTorrentCandidates(client, request, options.category).catch(
          () => [],
        )),
      );
      if (qbittorrentSearchPluginsEnabled(request.policy.sourceSettings)) {
        const search = await pluginSearchCandidates(client, request);
        candidates.push(...search.candidates);
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
    async findCandidateSearch(
      request: DocumentAcquisitionRequest,
      customQuery?: string,
    ): Promise<{
      candidates: DocumentCandidate[];
      blockedCandidates: BookDocumentBlockedCandidateOption[];
      searchAttempts: BookDocumentSearchAttempt[];
    }> {
      if (!qbittorrentDocumentSourceEnabled(request.policy.sourceSettings)) {
        return { candidates: [], blockedCandidates: [], searchAttempts: [] };
      }
      await client.login();
      const search = qbittorrentSearchPluginsEnabled(
        request.policy.sourceSettings,
      )
        ? await pluginSearchCandidates(client, request, customQuery)
        : { candidates: [], blockedCandidates: [], searchAttempts: [] };
      const localCandidates = await localTorrentCandidates(
        client,
        request,
      ).catch(() => []);
      const manualCandidate = userProvidedTorrentCandidate(request);
      return {
        ...search,
        candidates: rankDocumentCandidates(
          [
            ...(manualCandidate ? [manualCandidate] : []),
            ...localCandidates,
            ...search.candidates,
          ],
          request.policy,
          request.book.documentAcquisition,
        ),
      };
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
    checkBridgeHealth(settings: QbittorrentConnectionSettings) {
      return checkQbittorrentBridgeHealth(fetchImpl, settings);
    },
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
      searchQuery?: string,
    ): Promise<{
      candidates: BookDocumentCandidateOption[];
      blockedCandidates: BookDocumentBlockedCandidateOption[];
      searchAttempts: BookDocumentSearchAttempt[];
    }> {
      const provider = createQBittorrentProvider(
        settingsToOptions(settings, fetchImpl),
      );
      const search = await provider.findCandidateSearch(
        acquisitionRequest(request, settings),
        searchQuery,
      );
      return {
        candidates: search.candidates.map(candidateOption),
        blockedCandidates: search.blockedCandidates,
        searchAttempts: search.searchAttempts,
      };
    },
    async acquireDocumentCandidate(
      settings: QbittorrentConnectionSettings,
      request: EnrichmentRequest,
      candidateId: string,
      candidates: BookDocumentCandidateOption[],
    ) {
      const option = candidates.find(
        (candidate) => candidate.id === candidateId,
      );
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
