import type {
  BookSearchSuggestion,
  SearchBooksRequest,
  SearchBooksResponse,
} from '../core/types';
import { metadataSourceEnabled } from '../core/source-settings-policy';
import {
  DEFAULT_SEARCH_PAGE_SIZE,
  isCatalogQueryReady,
  isFullIsbnQuery,
  openLibraryFallbackSearchParams,
  openLibrarySearchParams,
} from './book-search';
import type { SearchResponse } from './openlibrary-types';
import {
  dedupeSuggestions,
  isbnSuggestion,
  searchSuggestionFromDoc,
  stableSearchKey,
} from './openlibrary-search';
import { cacheEntryIsFresh, cacheExpiresAt, systemNowMs, type NowMs } from './cache-time';
import { withRetry } from './enrichment-http';

type JsonFetcher = <T>(url: string, signal?: AbortSignal) => Promise<T>;

export const ENRICHMENT_SEARCH_RESPONSE_LIMIT = DEFAULT_SEARCH_PAGE_SIZE;

interface SearchCacheValue {
  expiresAt: number;
  results: SearchBooksResponse;
}

interface OpenLibrarySearchRunnerOptions {
  jsonFetcher: JsonFetcher;
  cacheTtlMs: number;
  retryCount: number;
  nowMs?: NowMs;
}

interface OpenLibrarySearchRunner {
  searchBooks(request: SearchBooksRequest): Promise<SearchBooksResponse>;
}

export function normalizedSearchOffset(request: SearchBooksRequest): number {
  return Math.max(0, Math.round(request.offset ?? 0));
}

export function normalizedSearchLimit(request: SearchBooksRequest): number {
  return Math.max(1, Math.round(request.limit ?? ENRICHMENT_SEARCH_RESPONSE_LIMIT));
}

export function searchRequestKey(request: SearchBooksRequest): string {
  const openLibraryEnabled = metadataSourceEnabled(request.sourceSettings, 'openlibrary') ? '1' : '0';
  return `${stableSearchKey(
    request.query,
    normalizedSearchOffset(request),
    normalizedSearchLimit(request),
  )}::ol:${openLibraryEnabled}`;
}

async function fetchOpenLibrarySearch(
  request: SearchBooksRequest,
  options: OpenLibrarySearchRunnerOptions,
): Promise<SearchResponse> {
  const offset = normalizedSearchOffset(request);
  const limit = normalizedSearchLimit(request);
  const params = openLibrarySearchParams(request.query, { offset, limit });
  try {
    return await withRetry(
      () => options.jsonFetcher<SearchResponse>(
        `https://openlibrary.org/search.json?${params.toString()}`,
        request.signal,
      ),
      options.retryCount,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('HTTP 422')) {
      throw error;
    }
    const fallback = openLibraryFallbackSearchParams(request.query, { offset, limit });
    return withRetry(
      () => options.jsonFetcher<SearchResponse>(
        `https://openlibrary.org/search.json?${fallback.toString()}`,
        request.signal,
      ),
      options.retryCount,
    );
  }
}

function searchResponseFromDocs(
  docs: SearchResponse['docs'],
  offset: number,
  limit: number,
): SearchBooksResponse {
  const results = dedupeSuggestions(
    (docs ?? [])
      .map(searchSuggestionFromDoc)
      .filter(Boolean) as BookSearchSuggestion[],
  ).slice(0, limit);
  return {
    results,
    hasMore: (docs ?? []).length >= limit,
    nextOffset: offset + (docs ?? []).length,
    mode: 'search',
  };
}

export function createOpenLibrarySearchRunner(options: OpenLibrarySearchRunnerOptions): OpenLibrarySearchRunner {
  const cache = new Map<string, SearchCacheValue>();
  const nowMs = options.nowMs ?? systemNowMs;

  return {
    async searchBooks(request: SearchBooksRequest): Promise<SearchBooksResponse> {
      const offset = normalizedSearchOffset(request);
      const limit = normalizedSearchLimit(request);
      const key = searchRequestKey(request);
      if (!isCatalogQueryReady(request.query)) {
        return { results: [], hasMore: false, nextOffset: 0, mode: 'search' };
      }
      if (!metadataSourceEnabled(request.sourceSettings, 'openlibrary')) {
        return { results: [], hasMore: false, nextOffset: 0, mode: 'search' };
      }
      const cached = cache.get(key);
      if (cached && cacheEntryIsFresh(cached.expiresAt, nowMs)) {
        return cached.results;
      }

      if (offset === 0 && isFullIsbnQuery(request.query)) {
        const exact = await isbnSuggestion(options.jsonFetcher, request.query, request.signal);
        if (exact) {
          const response: SearchBooksResponse = {
            results: [exact],
            hasMore: false,
            nextOffset: 1,
            mode: 'isbn',
          };
          cache.set(key, { expiresAt: cacheExpiresAt(options.cacheTtlMs, nowMs), results: response });
          return response;
        }
      }

      const response = await fetchOpenLibrarySearch(request, options);
      const results = searchResponseFromDocs(response.docs, offset, limit);
      cache.set(key, { expiresAt: cacheExpiresAt(options.cacheTtlMs, nowMs), results });
      return results;
    },
  };
}
