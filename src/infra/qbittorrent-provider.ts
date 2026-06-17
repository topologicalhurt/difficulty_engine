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
  Logger,
} from '../core/types';
import {
  qbittorrentDocumentSourceEnabled,
  qbittorrentSearchPluginsEnabled,
  qbittorrentUserTorrentsEnabled,
} from '../core/source-settings-policy';
import { acquireTorrentDocument } from './qbittorrent-acquisition';
import { isSafeTorrentSource } from '../core/document-source-safety';
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

function userProvidedTorrentCandidate(
  request: DocumentAcquisitionRequest,
): DocumentCandidate | null {
  const sourcePath = request.book.sourcePath?.trim();
  if (
    !qbittorrentUserTorrentsEnabled(request.policy.sourceSettings) ||
    !sourcePath ||
    !isSafeTorrentSource(sourcePath)
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function emptySearchResult(): {
  candidates: DocumentCandidate[];
  blockedCandidates: BookDocumentBlockedCandidateOption[];
  searchAttempts: BookDocumentSearchAttempt[];
} {
  return { candidates: [], blockedCandidates: [], searchAttempts: [] };
}

async function localTorrentCandidates(
  client: QBittorrentClient,
  request: DocumentAcquisitionRequest,
  preferredCategory?: string,
  logger?: Logger,
): Promise<DocumentCandidate[]> {
  const inventory = await readQbittorrentLiveInventory(client);
  // Surface per-torrent file-read failures: otherwise a torrent silently
  // becomes a non-candidate (zero eligible files) with no diagnostic trail.
  if (logger && inventory.errors.length) {
    logger.warn('qbittorrent.live_inventory.file_read_failed', {
      bookId: request.book.id,
      errorCount: inventory.errors.length,
      errors: inventory.errors.slice(0, 5),
    });
  }
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
        ...(await localTorrentCandidates(
          client,
          request,
          options.category,
          options.logger,
        ).catch((error) => {
          options.logger?.warn('qbittorrent.live_inventory.unavailable', {
            bookId: request.book.id,
            error: errorMessage(error),
          });
          return [];
        })),
      );
      if (qbittorrentSearchPluginsEnabled(request.policy.sourceSettings)) {
        // A flaky plugin/login must not discard the local + manual candidates
        // already gathered — degrade the secondary source, don't abort.
        const search = await pluginSearchCandidates(client, request).catch(
          (error) => {
            options.logger?.warn('qbittorrent.plugin_search.failed', {
              bookId: request.book.id,
              error: errorMessage(error),
            });
            return emptySearchResult();
          },
        );
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
        ? await pluginSearchCandidates(client, request, customQuery).catch(
            (error) => {
              options.logger?.warn('qbittorrent.plugin_search.failed', {
                bookId: request.book.id,
                error: errorMessage(error),
              });
              return emptySearchResult();
            },
          )
        : emptySearchResult();
      const localCandidates = await localTorrentCandidates(
        client,
        request,
        options.category,
        options.logger,
      ).catch((error) => {
        options.logger?.warn('qbittorrent.live_inventory.unavailable', {
          bookId: request.book.id,
          error: errorMessage(error),
        });
        return [];
      });
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
