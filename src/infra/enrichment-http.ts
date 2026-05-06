import type { Logger } from '../core/types';

export const ENRICHMENT_TIMEOUT_MS = 8_000;
export const ENRICHMENT_RETRY_COUNT = 1;
export const ENRICHMENT_CACHE_TTL_MS = 6 * 60 * 60 * 1_000;

export type JsonFetcher = <T>(url: string, signal?: AbortSignal) => Promise<T>;

function mergeAbortSignals(
  signal: AbortSignal | undefined,
  controller: AbortController,
): () => void {
  if (!signal) return () => {};
  const onAbort = (): void => controller.abort(signal.reason);
  signal.addEventListener('abort', onAbort, { once: true });
  return () => signal.removeEventListener('abort', onAbort);
}

export async function fetchJson<T>(
  fetchImpl: typeof fetch,
  url: string,
  timeoutMs: number,
  logger: Logger,
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const detach = mergeAbortSignals(signal, controller);
  const timeout = globalThis.setTimeout(
    () => controller.abort(new Error('Enrichment timed out')),
    timeoutMs,
  );
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return (await response.json()) as T;
  } catch (error) {
    logger.warn('enrichment.fetch.failed', {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    detach();
    globalThis.clearTimeout(timeout);
  }
}

export async function withRetry<T>(
  attempt: () => Promise<T>,
  retries: number,
): Promise<T> {
  let lastError: unknown;
  for (let index = 0; index <= retries; index += 1) {
    try {
      return await attempt();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
