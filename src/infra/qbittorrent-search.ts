import type {
  DocumentAcquisitionRequest,
  DocumentCandidate,
} from './document-acquisition';
import { normalizeMatcherText, sharesAnyMatchToken } from '../core/matchers';
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

const MAX_QBITTORRENT_SEARCH_PATTERNS = 6;

// Search plugins are literal-string matchers more often than semantic searchers.
// Keep variants precise, but remove edition/noise words that commonly hide hits.
const SEARCH_NOISE_WORD_PATTERN =
  /\b(?:\d+(?:st|nd|rd|th)?\s+(?:edition|ed\.?)|(?:edition|ed\.?)\s*\d+|revised|updated|international|student|instructor'?s?|solutions?|manual|workbook|companion)\b/gi;
const TITLE_TRAILING_DETAIL_PATTERN = /\s*(?::|\(|\s[-–—]\s).*$/;
const MIN_SEARCH_TOKEN_LENGTH = 3;

function compactSearchText(value: string): string {
  return normalizeMatcherText(
    value
      .replace(SEARCH_NOISE_WORD_PATTERN, ' ')
      .replace(/[,:;]+/g, ' ')
      .replace(/[()[\]{}]/g, ' '),
  );
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values.map((value) => compactSearchText(value ?? '')).filter(Boolean),
    ),
  );
}

function sharesSearchToken(left: string, right: string): boolean {
  return (
    left.length >= MIN_SEARCH_TOKEN_LENGTH && sharesAnyMatchToken(left, right)
  );
}

function titleSearchVariants(title: string, shortTitle: string): string[] {
  const compactTitle = compactSearchText(title);
  const titleWithoutTrailingDetail = compactSearchText(
    title.replace(TITLE_TRAILING_DETAIL_PATTERN, ''),
  );
  return uniqueNonEmpty([
    compactTitle,
    titleWithoutTrailingDetail,
    sharesSearchToken(compactTitle, shortTitle) ? shortTitle : '',
  ]);
}

function authorSearchVariants(authors: string[]): string[] {
  const firstAuthor = compactSearchText(authors[0] ?? '');
  const authorParts = firstAuthor.split(/\s+/).filter(Boolean);
  const lastName = authorParts.length
    ? authorParts[authorParts.length - 1]
    : '';
  return uniqueNonEmpty([firstAuthor, lastName]).filter(
    (author) => author.length > 2,
  );
}

export function qbittorrentSearchPatterns(
  request: DocumentAcquisitionRequest,
): string[] {
  const isbn = normalizedBookIsbn(request.book.isbn);
  const titles = titleSearchVariants(request.book.title, request.book.short);
  const authors = authorSearchVariants(request.book.authors);
  const titleAuthorPatterns = titles.flatMap((title) =>
    authors.map((author) => `${title} ${author}`),
  );
  return uniqueNonEmpty([isbn, ...titleAuthorPatterns, ...titles]).slice(
    0,
    MAX_QBITTORRENT_SEARCH_PATTERNS,
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
