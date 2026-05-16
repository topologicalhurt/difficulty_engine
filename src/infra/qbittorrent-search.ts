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
} from '../core/matchers';
import { isSafeTorrentSource } from '../core/document-source-safety';
import type { QbittorrentPluginInfo } from '../core/types';
import { currentIsoTimestamp } from '../core/time';
import {
  BAD_FILE_NAME_PATTERN,
  bookMatchScore,
  hasExactQbittorrentTitlePhrase,
  hasRequiredQbittorrentTitleEvidence,
  MIN_PLUGIN_SEEDERS,
  MIN_TORRENT_MATCH_SCORE,
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
import {
  peersFromSearchResult,
  seedersFromSearchResult,
} from './qbittorrent-search-result-fields';
import type { QbittorrentSearchQuery } from './qbittorrent-search-queries';
import type { SearchResult } from './qbittorrent-types';

const MIN_USER_OWNED_RETRY_SCORE = 0.55;
const NON_PDF_ONLY_SEARCH_RESULT_PATTERN =
  /\b(?:epub|mobi|azw3|djvu|txt|text)\b/i;
const PDF_SEARCH_RESULT_PATTERN = /\bpdf\b/i;

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

function sourceUrl(result: SearchResult): string {
  return result.fileUrl ?? result.descrLink ?? '';
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
    authorAppearsInText(request.book.authors, evidenceText) ||
    hasExactQbittorrentTitlePhrase(result.fileName ?? '', request)
  );
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

function searchResultLooksNonPdfOnly(result: SearchResult): boolean {
  const text = searchResultEvidenceText(result);
  return (
    NON_PDF_ONLY_SEARCH_RESULT_PATTERN.test(text) &&
    !PDF_SEARCH_RESULT_PATTERN.test(text)
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
  const searchAvailability = {
    seeders,
    peers,
    observedAt: currentIsoTimestamp(),
    plugin: meta.plugin,
    pattern: meta.pattern,
  };
  const numericSeeders = seeders ?? 0;
  const matchScore = bookMatchScore(title, request);
  const contentKind = contentKindFromUrl(title || url);
  const retryableAsUserOwned =
    reasons.some((reason) =>
      ['unknown access basis', 'unallowed plugin/site'].includes(reason),
    ) &&
    !reasons.includes('qBittorrent document acquisition requires PDF files') &&
    !reasons.includes('plugin error') &&
    !reasons.includes('missing distinctive title token') &&
    isSafeTorrentSource(url) &&
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
    searchAvailability,
    availabilitySource: 'search_result',
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
    const searchAvailability = {
      seeders,
      peers,
      observedAt: currentIsoTimestamp(),
      plugin: meta.plugin,
      pattern: meta.pattern,
    };
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
      !isSafeTorrentSource(sourceUrl(result))
        ? 'missing direct magnet or HTTPS .torrent URL'
        : '',
      BAD_FILE_NAME_PATTERN.test(title) ? 'solution/manual/sample file' : '',
      (detectedContentKind !== 'unknown' && detectedContentKind !== 'pdf') ||
      searchResultLooksNonPdfOnly(result)
        ? 'qBittorrent document acquisition requires PDF files'
        : '',
      numericSeeders < MIN_PLUGIN_SEEDERS ? 'zero seeders' : '',
      matchScore < MIN_TORRENT_MATCH_SCORE ? 'weak title match' : '',
      !hasRequiredQbittorrentTitleEvidence(
        searchResultEvidenceText(result),
        request,
      )
        ? 'missing distinctive title token'
        : '',
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
      searchAvailability,
      availabilitySource: 'search_result' as const,
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
