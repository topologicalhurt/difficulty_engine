import type {
  DocumentAcquisitionRequest,
  DocumentCandidate,
} from './document-acquisition';
import type { QbittorrentPluginInfo } from '../core/types';
import {
  bookMatchScore,
  compareDocumentCandidateQuality,
  MIN_PLUGIN_SEEDERS,
  MIN_TORRENT_MATCH_SCORE,
  normalizedBookIsbn,
} from './qbittorrent-selection';
import {
  accessBasisForSearchResult,
  hostFromUrl,
  sourceIsAllowed,
} from './qbittorrent-source-policy';
import { contentKindFromUrl } from './qbittorrent-file-kinds';
import type { SearchResult } from './qbittorrent-types';

const PLUGIN_SEARCH_FALLBACK_LIMIT = 2;

export function qbittorrentSearchPatterns(
  request: DocumentAcquisitionRequest,
): string[] {
  const isbn = normalizedBookIsbn(request.book.isbn);
  const title = request.book.title.trim();
  const author = request.book.authors[0]?.trim() ?? '';
  return Array.from(
    new Set(
      [isbn, [title, author].filter(Boolean).join(' '), title].filter(Boolean),
    ),
  ).slice(0, isbn ? PLUGIN_SEARCH_FALLBACK_LIMIT : 1);
}

export function shouldStopAfterSearchPattern(
  pattern: string,
  request: DocumentAcquisitionRequest,
  candidates: DocumentCandidate[],
): boolean {
  const isbn = normalizedBookIsbn(request.book.isbn);
  return Boolean(
    isbn &&
      pattern === isbn &&
      candidates.some(
        (candidate) =>
          candidate.accessBasis != null &&
          request.policy.allowedAccess.includes(candidate.accessBasis),
      ),
  );
}

export function candidatesFromSearchResults(
  results: SearchResult[],
  allowedPlugins: QbittorrentPluginInfo[],
  request: DocumentAcquisitionRequest,
  idPrefix = `qbittorrent-search:${request.book.id}`,
): DocumentCandidate[] {
  return results
    .map((result, index): DocumentCandidate | null => {
      const seeders = Math.max(0, result.nbSeeders ?? 0);
      if (seeders < MIN_PLUGIN_SEEDERS) return null;
      const title = result.fileName || request.book.title;
      const matchScore = bookMatchScore(title, request);
      if (matchScore < MIN_TORRENT_MATCH_SCORE) return null;
      const pluginName =
        allowedPlugins.find((plugin) =>
          result.siteUrl
            ? sourceIsAllowed(result.siteUrl, [hostFromUrl(plugin.url)])
            : false,
        )?.name ??
        allowedPlugins[0]?.name ??
        '';
      return {
        id: `${idPrefix}:${index}`,
        provider: 'qbittorrent',
        title,
        sourceUrl: result.fileUrl ?? result.descrLink ?? '',
        contentKind: contentKindFromUrl(
          result.fileName || result.fileUrl || '',
        ),
        accessBasis: accessBasisForSearchResult(result, pluginName, request),
        confidence: Math.min(
          0.96,
          0.42 + matchScore * 0.42 + Math.min(0.12, seeders / 100),
        ),
        matchScore,
        seeders,
        peers: Math.max(0, result.nbLeechers ?? 0),
        availability: {
          seeders,
          peers: Math.max(0, result.nbLeechers ?? 0),
          progress: 0,
          state: 'search-result',
        },
        sizeBytes:
          result.fileSize && result.fileSize > 0 ? result.fileSize : undefined,
      };
    })
    .filter((candidate): candidate is DocumentCandidate =>
      Boolean(candidate?.sourceUrl),
    );
}

export function sortSearchCandidates(
  candidates: DocumentCandidate[],
  request: DocumentAcquisitionRequest,
): DocumentCandidate[] {
  const contentOrder = [...request.policy.contentPreference, 'unknown'];
  const contentPriority = (kind: DocumentCandidate['contentKind']): number => {
    const index = contentOrder.indexOf(kind);
    return index >= 0 ? index : contentOrder.length;
  };
  return [...candidates].sort((left, right) =>
    compareDocumentCandidateQuality(left, right, contentPriority),
  );
}
