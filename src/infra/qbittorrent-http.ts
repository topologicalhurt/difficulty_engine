import { isLoopbackHost } from './url-security';

export const DEFAULT_QBITTORRENT_TIMEOUT_MS = 10_000;

const DIRECT_WEB_UI_PORT_PATTERN = /:8080(?:\/|$)/;
const ABSOLUTE_PATH_PATTERN = /^\/|^[a-z]:[\\/]/i;

// The qBittorrent channel carries credentials (login body) and a session
// cookie, so — like the AI endpoint and direct-document URL surfaces — it is
// restricted to https or http on a loopback host. This refuses to exfiltrate
// credentials to an arbitrary plaintext-HTTP host if a remote baseUrl is
// entered or pasted.
export function isAllowedQbittorrentBaseUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && isLoopbackHost(url.hostname);
  } catch {
    return false;
  }
}

export function trimQbittorrentBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

export function isAbsoluteStoragePath(value: string): boolean {
  return ABSOLUTE_PATH_PATTERN.test(value);
}

export function normalizeStoragePath(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/\\/g, '/')
    .replace(/\/+$/g, '');
}

export function bridgeDataRootMatchesSavePath(
  bridgeDataRoot: string | null | undefined,
  savePath: string | null | undefined,
): boolean {
  if (!bridgeDataRoot || !savePath) return true;
  const root = normalizeStoragePath(bridgeDataRoot);
  const expected = normalizeStoragePath(savePath);
  if (!root || !expected) return true;
  if (isAbsoluteStoragePath(expected)) return root === expected;
  return root === expected || root.endsWith(`/${expected}`);
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
  if (!isAllowedQbittorrentBaseUrl(baseUrl)) {
    throw new Error(
      'qBittorrent bridge URL must be https or http on a loopback host ' +
        '(e.g. http://127.0.0.1:8787). Refusing to send credentials to a ' +
        'non-loopback HTTP host.',
    );
  }
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

// A 200 response can still carry a non-JSON body (a reverse proxy / Web-UI SPA
// HTML page, a misconfigured bridge target). Parse via text so a failure
// carries a diagnostic snippet instead of a bare SyntaxError, and validate the
// top-level shape so an error envelope never reaches a .map/.slice as if it
// were the expected array/object.
async function readQbittorrentJsonBody(
  response: Response,
  endpoint: string,
): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    const snippet = text.slice(0, 120).replace(/\s+/g, ' ').trim();
    throw new Error(
      `qBittorrent ${endpoint} returned a non-JSON body: ${snippet || '(empty)'}`,
    );
  }
}

export async function parseQbittorrentJsonArray<T>(
  response: Response,
  endpoint: string,
): Promise<T[]> {
  const body = await readQbittorrentJsonBody(response, endpoint);
  if (!Array.isArray(body)) {
    throw new Error(
      `qBittorrent ${endpoint} expected a JSON array but received ${typeof body}.`,
    );
  }
  return body as T[];
}

export async function parseQbittorrentJsonObject<T>(
  response: Response,
  endpoint: string,
): Promise<T> {
  const body = await readQbittorrentJsonBody(response, endpoint);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error(
      `qBittorrent ${endpoint} expected a JSON object but received ${
        Array.isArray(body) ? 'an array' : typeof body
      }.`,
    );
  }
  return body as T;
}
