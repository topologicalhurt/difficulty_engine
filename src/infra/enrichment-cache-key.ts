import type { EnrichmentRequest } from '../core/types';
import { normalizedIsbn } from '../core/isbn';

function sorted(values: string[]): string[] {
  return [...values].sort();
}

function sourceMaskKey(request: EnrichmentRequest): string {
  return JSON.stringify({
    metadataSources: request.sourceSettings.metadataSources,
    documentSources: request.sourceSettings.documentSources,
    contentPreference: request.sourceSettings.contentPreference,
    qbittorrent: {
      ...request.sourceSettings.qbittorrent,
      allowedPlugins: sorted(request.sourceSettings.qbittorrent.allowedPlugins),
      allowedSites: sorted(request.sourceSettings.qbittorrent.allowedSites),
      categories: sorted(request.sourceSettings.qbittorrent.categories),
    },
    qbittorrentConnection: {
      enabled: Boolean(request.qbittorrentConnection?.enabled),
      baseUrl: request.qbittorrentConnection?.baseUrl ?? '',
      savePath: request.qbittorrentConnection?.savePath ?? '',
      category: request.qbittorrentConnection?.category ?? '',
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
