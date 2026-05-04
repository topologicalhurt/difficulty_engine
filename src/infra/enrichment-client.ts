import type {
  EnrichmentProvider,
  EnrichmentRequest,
  EnrichmentResponse,
  Logger,
  SearchBooksRequest,
  SearchBooksResponse,
} from '../core/types';
import type {
  DocumentAcquisitionPolicy,
  DocumentAcquisitionProvider,
} from './document-acquisition';
import { cacheEntryIsFresh, cacheExpiresAt, systemNowMs, type NowMs } from './cache-time';
import { consoleLogger } from './logger';
import {
  ENRICHMENT_CACHE_TTL_MS,
  ENRICHMENT_RETRY_COUNT,
  ENRICHMENT_TIMEOUT_MS,
  fetchJson,
} from './enrichment-http';
import { stableEnrichmentCacheKey } from './enrichment-cache-key';
import { createBookEnrichmentLoader } from './enrichment-documents';
import {
  createOpenLibrarySearchRunner,
  searchRequestKey,
} from './enrichment-search';

interface CreateEnrichmentClientOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  retryCount?: number;
  cacheTtlMs?: number;
  logger?: Logger;
  documentAcquisitionProvider?: DocumentAcquisitionProvider;
  documentAcquisitionPolicy?: DocumentAcquisitionPolicy;
  nowMs?: NowMs;
}

interface CacheValue {
  expiresAt: number;
  response: EnrichmentResponse;
}

export function createEnrichmentClient(
  options: CreateEnrichmentClientOptions = {},
): EnrichmentProvider {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? ENRICHMENT_TIMEOUT_MS;
  const retryCount = options.retryCount ?? ENRICHMENT_RETRY_COUNT;
  const cacheTtlMs = options.cacheTtlMs ?? ENRICHMENT_CACHE_TTL_MS;
  const nowMs = options.nowMs ?? systemNowMs;
  const logger = options.logger ?? consoleLogger;
  const inFlight = new Map<string, Promise<EnrichmentResponse>>();
  const memoryCache = new Map<string, CacheValue>();
  const searchInFlight = new Map<string, Promise<SearchBooksResponse>>();
  const jsonFetcher = <T>(url: string, signal?: AbortSignal): Promise<T> =>
    fetchJson<T>(fetchImpl, url, timeoutMs, logger, signal);
  const bookLoader = createBookEnrichmentLoader({
    fetchImpl,
    jsonFetcher,
    logger,
    documentAcquisitionProvider: options.documentAcquisitionProvider,
    documentAcquisitionPolicy: options.documentAcquisitionPolicy,
  });
  const searchRunner = createOpenLibrarySearchRunner({
    jsonFetcher,
    cacheTtlMs,
    retryCount,
    nowMs,
  });

  async function loadBook(request: EnrichmentRequest): Promise<EnrichmentResponse> {
    const key = stableEnrichmentCacheKey(request);
    const cached = memoryCache.get(key);
    if (cached && cacheEntryIsFresh(cached.expiresAt, nowMs)) {
      return cached.response;
    }
    const response = await bookLoader.loadBook(request, key);
    memoryCache.set(key, {
      response,
      expiresAt: cacheExpiresAt(cacheTtlMs, nowMs),
    });
    return response;
  }

  return {
    async fetchBook(request: EnrichmentRequest): Promise<EnrichmentResponse> {
      const key = stableEnrichmentCacheKey(request);
      const existing = inFlight.get(key);
      if (existing) {
        return existing;
      }
      const task = loadBook(request).finally(() => {
        inFlight.delete(key);
      });
      inFlight.set(key, task);
      return task;
    },
    async searchBooks(request: SearchBooksRequest): Promise<SearchBooksResponse> {
      const key = searchRequestKey(request);
      const existing = searchInFlight.get(key);
      if (existing) {
        return existing;
      }
      const task = searchRunner.searchBooks(request).finally(() => {
        searchInFlight.delete(key);
      });
      searchInFlight.set(key, task);
      return task;
    },
  };
}
