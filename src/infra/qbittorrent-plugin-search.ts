import type {
  DocumentAcquisitionRequest,
  DocumentCandidate,
} from './document-acquisition';
import { qbittorrentSearchPluginsEnabled } from '../core/source-settings-policy';
import type { QBittorrentClient } from './qbittorrent-client';
import {
  candidatesFromSearchResults,
  qbittorrentSearchPatterns,
  sortSearchCandidates,
} from './qbittorrent-search';
import { pluginIsAllowed } from './qbittorrent-source-policy';
import type { SearchResultsResponse } from './qbittorrent-types';

export async function pluginSearchCandidates(
  client: QBittorrentClient,
  request: DocumentAcquisitionRequest,
): Promise<DocumentCandidate[]> {
  if (!qbittorrentSearchPluginsEnabled(request.policy.sourceSettings))
    return [];
  const settings = request.policy.sourceSettings?.qbittorrent;
  if (!settings) return [];
  if (
    settings.requireKnownAccessBasis &&
    !settings.allowedPlugins.length &&
    !settings.allowedSites.length
  ) {
    return [];
  }
  const availablePlugins = await client.listPlugins();
  const allowedPlugins = availablePlugins
    .filter((plugin) => plugin.enabled)
    .filter((plugin) => pluginIsAllowed(plugin, settings));
  if (!allowedPlugins.length) return [];
  const category = settings.categories[0] ?? 'all';
  const seenUrls = new Set<string>();
  const candidates: DocumentCandidate[] = [];
  const patterns = qbittorrentSearchPatterns(request);

  const searchJobs = await Promise.all(
    patterns.flatMap((pattern, patternIndex) =>
      allowedPlugins.map(async (plugin) => ({
        plugin,
        patternIndex,
        payload: await client
          .runSinglePluginSearch(
            pattern,
            plugin.name,
            category,
            settings.maxResults,
          )
          .catch((): SearchResultsResponse => ({})),
      })),
    ),
  );

  for (const { plugin, patternIndex, payload } of searchJobs) {
    const patternCandidates = candidatesFromSearchResults(
      (payload.results ?? []).slice(0, settings.maxResults),
      [plugin],
      request,
      `qbittorrent-search:${request.book.id}:${patternIndex}:${plugin.name}`,
    );
    for (const candidate of patternCandidates) {
      if (seenUrls.has(candidate.sourceUrl)) continue;
      seenUrls.add(candidate.sourceUrl);
      candidates.push(candidate);
    }
  }

  return sortSearchCandidates(candidates, request).slice(
    0,
    settings.maxResults,
  );
}
