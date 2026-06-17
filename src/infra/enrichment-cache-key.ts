import type { EnrichmentRequest } from '../core/types';
import { normalizedIsbn } from '../core/isbn';

function sourceMaskKey(request: EnrichmentRequest): string {
  const qbittorrent = request.sourceSettings.qbittorrent;
  return JSON.stringify({
    metadataSources: request.sourceSettings.metadataSources,
    documentSources: request.sourceSettings.documentSources,
    contentPreference: request.sourceSettings.contentPreference,
    qbittorrent: {
      ...qbittorrent,
      allowedPlugins: [...qbittorrent.allowedPlugins].sort(),
      allowedSites: [...qbittorrent.allowedSites].sort(),
      categories: [...qbittorrent.categories].sort(),
    },
    // Only whether qBittorrent is enabled participates in cache identity.
    // baseUrl/savePath/category are connection-only (they don't change the
    // metadata enrichment result; document state is fingerprinted separately
    // in documentCacheKey). Keeping them out of the key prevents the absolute
    // local savePath from being persisted into enrichmentCache[*].cacheKey and
    // exported in project JSON, and stops benign connection edits from
    // invalidating every cached enrichment entry.
    qbittorrentConnection: {
      enabled: Boolean(request.qbittorrentConnection?.enabled),
    },
    bridgeDocuments: request.skipBridgeDocuments ? 'metadata-only' : 'enabled',
  });
}

function documentCacheKey(request: EnrichmentRequest): string {
  return (request.book.documents ?? [])
    .map((document) =>
      [
        document.id,
        document.status,
        document.storagePath,
        document.sha256 ?? '',
        document.updatedAt,
      ].join(':'),
    )
    .sort()
    .join('|');
}

export function stableEnrichmentCacheKey(request: EnrichmentRequest): string {
  const isbn = normalizedIsbn(request.book.isbn);
  const suffix = `::sources:${sourceMaskKey(request)}::docs:${documentCacheKey(request)}`;
  if (isbn) {
    return `isbn:${isbn}${suffix}`;
  }
  const authors = request.book.authors.join('|').toLowerCase();
  return `title:${request.book.title.trim().toLowerCase()}::${authors}${suffix}`;
}
