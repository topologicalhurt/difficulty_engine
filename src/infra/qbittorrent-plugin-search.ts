import type {
  DocumentAcquisitionRequest,
  DocumentCandidate,
} from './document-acquisition';
import { qbittorrentSearchPluginsEnabled } from '../core/source-settings-policy';
import { currentIsoTimestamp } from '../core/time';
import type {
  BookDocumentBlockedCandidateOption,
  BookDocumentSearchAttempt,
} from '../core/types';
import type { QBittorrentClient } from './qbittorrent-client';
import {
  classifySearchResults,
  qbittorrentSearchQueries,
  sortSearchCandidates,
} from './qbittorrent-search';
import { pluginIsAllowed, sourceIsAllowed } from './qbittorrent-source-policy';
import { systemNowMs } from './cache-time';
import type { SearchResultsResponse } from './qbittorrent-types';

const MAX_CONCURRENT_QBITTORRENT_SEARCHES = 4;

export interface PluginSearchCandidateResult {
  candidates: DocumentCandidate[];
  blockedCandidates: BookDocumentBlockedCandidateOption[];
  searchAttempts: BookDocumentSearchAttempt[];
}

async function runLimited<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<T[]> {
  const results: T[] = [];
  let nextIndex = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      const task = tasks[index];
      if (!task) return;
      results[index] = await task();
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, () => worker()),
  );
  return results;
}

function emptySearchResult(): PluginSearchCandidateResult {
  return { candidates: [], blockedCandidates: [], searchAttempts: [] };
}

export async function pluginSearchCandidates(
  client: QBittorrentClient,
  request: DocumentAcquisitionRequest,
): Promise<PluginSearchCandidateResult> {
  if (!qbittorrentSearchPluginsEnabled(request.policy.sourceSettings))
    return emptySearchResult();
  const settings = request.policy.sourceSettings?.qbittorrent;
  if (!settings) return emptySearchResult();
  if (
    settings.requireKnownAccessBasis &&
    !settings.allowedPlugins.length &&
    !settings.allowedSites.length
  ) {
    return emptySearchResult();
  }
  const availablePlugins = await client.listPlugins();
  const allowedPlugins = availablePlugins
    .filter((plugin) => plugin.enabled)
    .filter((plugin) => pluginIsAllowed(plugin, settings));
  if (!allowedPlugins.length) return emptySearchResult();
  const category = settings.categories[0] ?? 'all';
  const siteMappedPlugins = allowedPlugins.filter(
    (plugin) =>
      !settings.allowedPlugins.includes(plugin.name) ||
      sourceIsAllowed(plugin.url, settings.allowedSites),
  );
  const explicitPlugins = allowedPlugins.filter(
    (plugin) =>
      settings.allowedPlugins.includes(plugin.name) &&
      !sourceIsAllowed(plugin.url, settings.allowedSites),
  );
  const pluginBatches = [
    ...(siteMappedPlugins.length
      ? [
          {
            pluginsToUse: siteMappedPlugins
              .map((plugin) => plugin.name)
              .join('|'),
            tracePluginName:
              siteMappedPlugins.length === 1
                ? siteMappedPlugins[0]?.name
                : undefined,
          },
        ]
      : []),
    ...explicitPlugins.map((plugin) => ({
      pluginsToUse: plugin.name,
      tracePluginName: plugin.name,
    })),
  ];
  const seenUrls = new Set<string>();
  const seenBlockedUrls = new Set<string>();
  const candidates: DocumentCandidate[] = [];
  const blockedCandidates: BookDocumentBlockedCandidateOption[] = [];
  const searchAttempts: BookDocumentSearchAttempt[] = [];
  const queries = qbittorrentSearchQueries(request);

  const searchJobs = await runLimited(
    queries.flatMap((query, queryIndex) =>
      pluginBatches.map((pluginBatch, batchIndex) => async () => {
        const startedAt = systemNowMs();
        const createdAt = currentIsoTimestamp();
        let payload: SearchResultsResponse = {};
        let error: string | undefined;
        try {
          payload = await client.runSinglePluginSearch(
            query.pattern,
            pluginBatch.pluginsToUse,
            category,
            settings.maxResults,
          );
        } catch (caught) {
          error =
            caught instanceof Error
              ? caught.message
              : 'qBittorrent search failed.';
        }
        const extraction = classifySearchResults(
          (payload.results ?? []).slice(0, settings.maxResults),
          allowedPlugins,
          request,
          `qbittorrent-search:${request.book.id}:${queryIndex}:${batchIndex}`,
          {
            intent: query.intent,
            pattern: query.pattern,
            plugin: pluginBatch.tracePluginName,
          },
        );
        return {
          query,
          queryIndex,
          batchIndex,
          pluginsToUse: pluginBatch.pluginsToUse,
          payload,
          error,
          extraction,
          pollDurationMs: systemNowMs() - startedAt,
          createdAt,
        };
      }),
    ),
    MAX_CONCURRENT_QBITTORRENT_SEARCHES,
  );

  for (const job of searchJobs) {
    for (const candidate of job.extraction.candidates) {
      if (seenUrls.has(candidate.sourceUrl)) continue;
      seenUrls.add(candidate.sourceUrl);
      candidates.push(candidate);
    }
    for (const blocked of job.extraction.blockedCandidates) {
      const key =
        blocked.sourceUrl || `${blocked.title}:${blocked.blockedReasons.join('|')}`;
      if (seenBlockedUrls.has(key)) continue;
      seenBlockedUrls.add(key);
      blockedCandidates.push(blocked);
    }
    searchAttempts.push({
      id: `qbittorrent-search-attempt:${request.book.id}:${job.queryIndex}:${job.batchIndex}`,
      provider: 'qbittorrent',
      intent: job.query.intent,
      pattern: job.query.pattern,
      plugins: job.pluginsToUse,
      category,
      resultCount: payloadResultCount(job.payload),
      acceptedCount: job.extraction.candidates.length,
      blockedCount: job.extraction.blockedCandidates.length,
      pollDurationMs: job.pollDurationMs,
      status: job.payload.status,
      error: job.error,
      rejectedReasons: firstRejectedReasons(job.extraction.blockedCandidates),
      createdAt: job.createdAt,
    });
  }

  return {
    candidates: sortSearchCandidates(candidates, request).slice(
      0,
      settings.maxResults,
    ),
    blockedCandidates,
    searchAttempts,
  };
}

function payloadResultCount(payload: SearchResultsResponse): number {
  return payload.total ?? payload.results?.length ?? 0;
}

function firstRejectedReasons(
  blockedCandidates: BookDocumentBlockedCandidateOption[],
): string[] {
  return [
    ...new Set(
      blockedCandidates.flatMap((candidate) => candidate.blockedReasons),
    ),
  ].slice(0, 5);
}
