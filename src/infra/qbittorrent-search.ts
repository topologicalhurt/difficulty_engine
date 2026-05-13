import type {
  DocumentAcquisitionRequest,
  DocumentCandidate,
} from './document-acquisition';
import type {
  BookDocumentBlockedCandidateOption,
  QbittorrentSearchIntent,
} from '../core/types';
import {
  authorAppearsInText,
  isbnAppearsInText,
  normalizeMatcherText,
  sharesAnyMatchToken,
} from '../core/matchers';
import type { QbittorrentPluginInfo } from '../core/types';
import { uniqueCompactStrings } from '../core/utils';
import {
  BAD_FILE_NAME_PATTERN,
  bookMatchScore,
  MIN_PLUGIN_SEEDERS,
  MIN_TORRENT_MATCH_SCORE,
  normalizedBookIsbn,
} from './qbittorrent-selection';
import {
  compareDocumentCandidateQuality,
  documentCandidateQualityScore,
} from './document-candidate-quality';
import {
  accessBasisForSearchResult,
  hostFromUrl,
  sourceIsAllowed,
} from './qbittorrent-source-policy';
import { contentKindPriorityForPreference } from './document-content-priority';
import { contentKindFromUrl } from './qbittorrent-file-kinds';
import type { SearchResult } from './qbittorrent-types';

const MAX_QBITTORRENT_SEARCH_PATTERNS = 7;
const MIN_USER_OWNED_RETRY_SCORE = 0.55;

// Search plugins are literal-string matchers more often than semantic searchers.
// Keep variants precise, but remove edition/noise words that commonly hide hits.
const SEARCH_NOISE_WORD_PATTERN =
  /\b(?:\d+(?:st|nd|rd|th)?\s*,\s*)?(?:(?:\d+(?:st|nd|rd|th)?|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(?:edition|ed\.?)|(?:edition|ed\.?)\s*\d+|revised|updated|international|student|instructor'?s?|solutions?|manual|workbook|companion)\b/gi;
const TITLE_TRAILING_DETAIL_PATTERN = /\s*(?::|\(|\s[-–—]\s).*$/;
const MIN_SEARCH_TOKEN_LENGTH = 3;
const AUTHOR_SEPARATOR_PATTERN = /\s*(?:\/|;|,|&|\band\b)\s*/i;
const INITIAL_PATTERN = /^[a-z]$/i;

export interface QbittorrentSearchQuery {
  intent: QbittorrentSearchIntent;
  pattern: string;
}

export interface QbittorrentSearchExtraction {
  candidates: DocumentCandidate[];
  blockedCandidates: BookDocumentBlockedCandidateOption[];
}

export interface QbittorrentPluginSearchTrace {
  query: QbittorrentSearchQuery;
  plugins: string;
  category: string;
  payload?: { status?: string; resultCount: number; pollDurationMs: number };
  error?: string;
  acceptedCount: number;
  blockedCandidates: BookDocumentBlockedCandidateOption[];
}

function compactSearchText(value: string): string {
  return normalizeMatcherText(
    value
      .replace(SEARCH_NOISE_WORD_PATTERN, ' ')
      .replace(/[,:;]+/g, ' ')
      .replace(/[()[\]{}]/g, ' '),
  );
}

function dehyphenatedSearchText(value: string): string {
  return compactSearchText(value.replace(/[-‐‑‒–—]/g, ' '));
}

function titleCore(title: string, fallback: string): string {
  const withoutDetail = title.replace(TITLE_TRAILING_DETAIL_PATTERN, '');
  return dehyphenatedSearchText(withoutDetail || fallback || title);
}

function sharesSearchToken(left: string, right: string): boolean {
  return (
    left.length >= MIN_SEARCH_TOKEN_LENGTH && sharesAnyMatchToken(left, right)
  );
}

function sourceUrl(result: SearchResult): string {
  return result.fileUrl ?? result.descrLink ?? '';
}

function sourceCanBeManuallyAdded(value: string): boolean {
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

function numberFromSearchResult(
  result: SearchResult,
  keys: string[],
): number | null {
  const raw = result as Record<string, unknown>;
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(0, value);
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return Math.max(0, parsed);
    }
  }
  return null;
}

function seedersFromSearchResult(result: SearchResult): number | null {
  return numberFromSearchResult(result, [
    'nbSeeders',
    'seeders',
    'seeds',
    'num_seeds',
    'numSeeds',
  ]);
}

function peersFromSearchResult(result: SearchResult): number | null {
  return numberFromSearchResult(result, [
    'nbLeechers',
    'leechers',
    'peers',
    'num_leechs',
    'numLeechs',
  ]);
}

function searchResultEvidenceText(result: SearchResult): string {
  return [
    result.fileName,
    result.fileUrl,
    result.descrLink,
    result.siteUrl,
  ].join(' ');
}

function hasRequiredAuthorEvidence(
  result: SearchResult,
  request: DocumentAcquisitionRequest,
): boolean {
  if (!request.book.authors.length) return true;
  const evidenceText = searchResultEvidenceText(result);
  return (
    isbnAppearsInText(request.book.isbn, evidenceText) ||
    authorAppearsInText(request.book.authors, evidenceText)
  );
}

function titleSearchVariants(title: string, shortTitle: string): string[] {
  const compactTitle = compactSearchText(title);
  const titleWithoutTrailingDetail = compactSearchText(
    title.replace(TITLE_TRAILING_DETAIL_PATTERN, ''),
  );
  return uniqueCompactStrings(
    [
      compactTitle,
      titleWithoutTrailingDetail,
      sharesSearchToken(compactTitle, shortTitle) ? shortTitle : '',
    ].map(compactSearchText),
  );
}

function authorSurnameTokens(value: string): string[] {
  const rawTokens = value.replace(/[.]/g, ' ').split(/\s+/).filter(Boolean);
  const afterInitials = rawTokens
    .flatMap((token, index) =>
      INITIAL_PATTERN.test(token) && rawTokens[index + 1]
        ? [rawTokens[index + 1]]
        : [],
    )
    .map(compactSearchText)
    .filter((token) => token.length > 2);
  if (afterInitials.length) return afterInitials;
  const normalized = compactSearchText(value);
  const parts = normalized.split(/\s+/).filter(Boolean);
  return parts.length ? [parts[parts.length - 1]].filter(Boolean) : [];
}

function authorSearchVariants(authors: string[]): string[] {
  const segments = authors.flatMap((author) =>
    String(author)
      .split(AUTHOR_SEPARATOR_PATTERN)
      .map((part) => part.trim())
      .filter(Boolean),
  );
  const surnames = segments.flatMap(authorSurnameTokens);
  return uniqueCompactStrings(surnames.map(compactSearchText)).filter(
    (author) => author.length > 2,
  );
}

function distinctiveTitleTokens(title: string): string[] {
  return title
    .split(/\s+/)
    .filter((token) => token.length >= MIN_SEARCH_TOKEN_LENGTH)
    .filter(
      (token) => !/^(?:the|and|for|with|from|into|edition|ed)$/.test(token),
    )
    .slice(0, 4);
}

function pushQuery(
  queries: QbittorrentSearchQuery[],
  seen: Set<string>,
  intent: QbittorrentSearchIntent,
  pattern: string,
): void {
  const compact = compactSearchText(pattern);
  if (!compact || seen.has(compact)) return;
  seen.add(compact);
  queries.push({ intent, pattern: compact });
}

export function customQbittorrentSearchQuery(
  pattern: string,
): QbittorrentSearchQuery {
  return { intent: 'custom_query', pattern: compactSearchText(pattern) };
}

export function qbittorrentSearchQueries(
  request: DocumentAcquisitionRequest,
): QbittorrentSearchQuery[] {
  const isbn = normalizedBookIsbn(request.book.isbn);
  const seen = new Set<string>();
  const queries: QbittorrentSearchQuery[] = [];
  const coreTitle = titleCore(request.book.title, request.book.short);
  const hyphenatedTitle = compactSearchText(
    request.book.title.replace(SEARCH_NOISE_WORD_PATTERN, ' '),
  );
  const titles = titleSearchVariants(request.book.title, request.book.short);
  const authors = authorSearchVariants(request.book.authors);
  const authorPhrase = authors.slice(0, 2).join(' ');
  const topicPhrase = distinctiveTitleTokens(coreTitle).slice(-2).join(' ');

  pushQuery(queries, seen, 'isbn_exact', isbn);
  pushQuery(queries, seen, 'core_title', coreTitle);
  if (authorPhrase) {
    pushQuery(
      queries,
      seen,
      'core_title_author',
      `${coreTitle} ${authorPhrase}`,
    );
    pushQuery(
      queries,
      seen,
      'author_topic',
      `${authorPhrase} ${topicPhrase || coreTitle}`,
    );
  }
  if (hyphenatedTitle.includes('-')) {
    pushQuery(queries, seen, 'hyphenated_title', hyphenatedTitle);
  }
  for (const title of titles) pushQuery(queries, seen, 'broad_recall', title);

  return queries.slice(0, MAX_QBITTORRENT_SEARCH_PATTERNS);
}

export function qbittorrentSearchPatterns(
  request: DocumentAcquisitionRequest,
): string[] {
  return qbittorrentSearchQueries(request).map((query) => query.pattern);
}

function searchResultPluginName(
  result: SearchResult,
  allowedPlugins: QbittorrentPluginInfo[],
): string {
  return (
    allowedPlugins.find((plugin) =>
      result.siteUrl
        ? sourceIsAllowed(result.siteUrl, [hostFromUrl(plugin.url)])
        : false,
    )?.name ?? ''
  );
}

function searchResultLooksLikePluginError(result: SearchResult): boolean {
  const text = `${result.fileName ?? ''} ${result.descrLink ?? ''}`;
  return /(?:api key|apikey|error|exception|unauthorized|forbidden)/i.test(
    text,
  );
}

function searchResultSourceIsAllowed(
  result: SearchResult,
  pluginName: string,
  request: DocumentAcquisitionRequest,
): boolean {
  const settings = request.policy.sourceSettings?.qbittorrent;
  if (!settings) return false;
  return (
    (pluginName && settings.allowedPlugins.includes(pluginName)) ||
    sourceIsAllowed(
      result.siteUrl ?? result.descrLink ?? result.fileUrl ?? '',
      settings.allowedSites,
    )
  );
}

function blockedCandidate(
  result: SearchResult,
  request: DocumentAcquisitionRequest,
  id: string,
  reasons: string[],
  meta: { intent?: QbittorrentSearchIntent; pattern?: string; plugin?: string },
): BookDocumentBlockedCandidateOption | null {
  const title = result.fileName || request.book.title;
  const url = sourceUrl(result);
  if (!url && !title) return null;
  const seeders = seedersFromSearchResult(result);
  const peers = peersFromSearchResult(result);
  const numericSeeders = seeders ?? 0;
  const matchScore = bookMatchScore(title, request);
  const contentKind = contentKindFromUrl(title || url);
  const retryableAsUserOwned =
    reasons.some((reason) =>
      ['unknown access basis', 'unallowed plugin/site'].includes(reason),
    ) &&
    !reasons.includes('qBittorrent document acquisition requires PDF files') &&
    !reasons.includes('plugin error') &&
    sourceCanBeManuallyAdded(url) &&
    numericSeeders >= MIN_PLUGIN_SEEDERS &&
    matchScore >= MIN_USER_OWNED_RETRY_SCORE &&
    hasRequiredAuthorEvidence(result, request) &&
    !BAD_FILE_NAME_PATTERN.test(title);
  return {
    id,
    provider: 'qbittorrent',
    title,
    sourceUrl: url || result.descrLink || title,
    contentKind,
    confidence: Math.min(0.9, 0.28 + matchScore * 0.5),
    blockedReasons: reasons,
    searchIntent: meta.intent,
    pattern: meta.pattern,
    plugin: meta.plugin,
    siteUrl: result.siteUrl,
    seeders,
    peers,
    matchScore,
    qualityReason: reasons.join(', '),
    retryableAsUserOwned,
    sizeBytes:
      result.fileSize && result.fileSize > 0 ? result.fileSize : undefined,
    availability: {
      seeders,
      peers,
      progress: 0,
      state: 'blocked-search-result',
    },
  };
}

export function classifySearchResults(
  results: SearchResult[],
  allowedPlugins: QbittorrentPluginInfo[],
  request: DocumentAcquisitionRequest,
  idPrefix = `qbittorrent-search:${request.book.id}`,
  meta: {
    intent?: QbittorrentSearchIntent;
    pattern?: string;
    plugin?: string;
  } = {},
): QbittorrentSearchExtraction {
  const candidates: DocumentCandidate[] = [];
  const blockedCandidates: BookDocumentBlockedCandidateOption[] = [];
  results.forEach((result, index) => {
    const title = result.fileName || request.book.title;
    const detectedContentKind = contentKindFromUrl(title || sourceUrl(result));
    const seeders = seedersFromSearchResult(result);
    const peers = peersFromSearchResult(result);
    const numericSeeders = seeders ?? 0;
    const matchScore = bookMatchScore(title, request);
    const pluginName =
      meta.plugin || searchResultPluginName(result, allowedPlugins);
    const sourceAllowed = searchResultSourceIsAllowed(
      result,
      pluginName,
      request,
    );
    const accessBasis = sourceAllowed
      ? accessBasisForSearchResult(result, pluginName, request)
      : undefined;
    const reasons = [
      searchResultLooksLikePluginError(result) ? 'plugin error' : '',
      BAD_FILE_NAME_PATTERN.test(title) ? 'solution/manual/sample file' : '',
      detectedContentKind !== 'unknown' && detectedContentKind !== 'pdf'
        ? 'qBittorrent document acquisition requires PDF files'
        : '',
      numericSeeders < MIN_PLUGIN_SEEDERS ? 'zero seeders' : '',
      matchScore < MIN_TORRENT_MATCH_SCORE ? 'weak title match' : '',
      !hasRequiredAuthorEvidence(result, request) ? 'author mismatch' : '',
      !sourceUrl(result) ? 'missing source URL' : '',
      !sourceAllowed ? 'unallowed plugin/site' : '',
      sourceAllowed && !accessBasis ? 'unknown access basis' : '',
    ].filter(Boolean);
    const id = `${idPrefix}:${index}`;
    if (reasons.length) {
      const blocked = blockedCandidate(result, request, id, reasons, {
        ...meta,
        plugin: pluginName,
      });
      if (blocked) blockedCandidates.push(blocked);
      return;
    }
    const candidate = {
      id,
      provider: 'qbittorrent',
      title,
      sourceUrl: sourceUrl(result),
      contentKind: detectedContentKind,
      accessBasis,
      confidence: Math.min(
        0.96,
        0.42 + matchScore * 0.42 + Math.min(0.12, numericSeeders / 100),
      ),
      matchScore,
      seeders,
      peers,
      availability: {
        seeders,
        peers,
        progress: 0,
        state: 'search-result',
      },
      sizeBytes:
        result.fileSize && result.fileSize > 0 ? result.fileSize : undefined,
    };
    candidates.push({
      ...candidate,
      qualityScore: documentCandidateQualityScore(
        candidate,
        contentKindPriorityForPreference(request.policy.contentPreference),
      ),
      qualityReason: `${numericSeeders} seeder(s), match ${Math.round(matchScore * 100)}%.`,
    });
  });
  return { candidates, blockedCandidates };
}

export function candidatesFromSearchResults(
  results: SearchResult[],
  allowedPlugins: QbittorrentPluginInfo[],
  request: DocumentAcquisitionRequest,
  idPrefix = `qbittorrent-search:${request.book.id}`,
): DocumentCandidate[] {
  return classifySearchResults(results, allowedPlugins, request, idPrefix)
    .candidates;
}

export function sortSearchCandidates(
  candidates: DocumentCandidate[],
  request: DocumentAcquisitionRequest,
): DocumentCandidate[] {
  const contentPriority = contentKindPriorityForPreference(
    request.policy.contentPreference,
  );
  return [...candidates].sort((left, right) =>
    compareDocumentCandidateQuality(left, right, contentPriority),
  );
}
