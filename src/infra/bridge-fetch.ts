// Shared timeout + bounded-read helpers for the local document/qBittorrent
// bridge. Every bridge fetch must be time-bounded (the bridge is a separate
// local process that can stall mid-stream) and every body read that buffers
// bytes must be size-capped (torrent-sourced PDFs are attacker-influenced and
// can be arbitrarily large). Centralized here so the qBittorrent API,
// bridge-health, document-API, direct-download, and completed-document-loader
// paths share one implementation instead of re-deriving it.

export const BRIDGE_DOCUMENT_TIMEOUT_MS = 60_000;
export const BRIDGE_DOCUMENT_MAX_BYTES = 8 * 1024 * 1024;

const RESPONSE_CHUNK_MISSING_LENGTH = -1;

/**
 * Fetch with a hard timeout, optionally linked to a caller's abort signal.
 * Aborts (and cleans up the timer/listener) whether the timeout fires, the
 * parent signal aborts, or the request settles.
 */
export async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(
    () => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)),
    timeoutMs,
  );
  const onParentAbort = (): void => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) controller.abort(parentSignal.reason);
  else parentSignal?.addEventListener('abort', onParentAbort, { once: true });
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    globalThis.clearTimeout(timeout);
    parentSignal?.removeEventListener('abort', onParentAbort);
  }
}

function contentLengthExceedsLimit(
  response: Response,
  limitBytes: number,
): boolean {
  const rawLength = response.headers.get('content-length');
  if (!rawLength) return false;
  const parsedLength = Number.parseInt(rawLength, 10);
  return Number.isFinite(parsedLength) && parsedLength > limitBytes;
}

/**
 * Read a response body into bytes, refusing (returning null) once the byte cap
 * is exceeded — via the Content-Length header up front and a streaming guard
 * while reading, so an oversized or unbounded body never materializes fully.
 */
export async function readLimitedResponseBytes(
  response: Response,
  limitBytes: number,
): Promise<Uint8Array | null> {
  if (contentLengthExceedsLimit(response, limitBytes)) return null;

  if (!response.body?.getReader) {
    const fallbackBytes = new Uint8Array(await response.arrayBuffer());
    return fallbackBytes.length > limitBytes ? null : fallbackBytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength ?? RESPONSE_CHUNK_MISSING_LENGTH;
      if (totalBytes < 0 || totalBytes > limitBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
