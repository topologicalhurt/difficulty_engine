export const DEFAULT_QBITTORRENT_TIMEOUT_MS = 10_000;

const DIRECT_WEB_UI_PORT_PATTERN = /:8080(?:\/|$)/;
const ABSOLUTE_PATH_PATTERN = /^\/|^[a-z]:[\\/]/i;

export function trimQbittorrentBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

export function isAbsoluteStoragePath(value: string): boolean {
  return ABSOLUTE_PATH_PATTERN.test(value);
}

async function withQbittorrentTimeout<T>(
  task: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(
    () => controller.abort(new Error('qBittorrent request timed out')),
    timeoutMs,
  );
  try {
    return await task(controller.signal);
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export async function requestQbittorrentApi(
  fetchImpl: typeof fetch,
  baseUrl: string,
  path: string,
  init: RequestInit,
  cookie: string,
  timeoutMs: number,
): Promise<Response> {
  try {
    return await withQbittorrentTimeout(async (signal) => {
      const response = await fetchImpl(`${baseUrl}/api/v2${path}`, {
        ...init,
        signal,
        headers: {
          ...(cookie ? { Cookie: cookie } : {}),
          ...(init.headers ?? {}),
        },
      });
      if (!response.ok)
        throw new Error(`qBittorrent HTTP ${response.status} for ${path}`);
      return response;
    }, timeoutMs);
  } catch (error) {
    if (
      error instanceof TypeError &&
      DIRECT_WEB_UI_PORT_PATTERN.test(baseUrl)
    ) {
      throw new Error(
        'Browser access to qBittorrent was blocked. Run the qBittorrent helper with the browser bridge and use http://127.0.0.1:8787 as the Bridge API URL.',
      );
    }
    throw error;
  }
}
