import type {
  QbittorrentBridgeHealth,
  QbittorrentConnectionSettings,
} from '../core/types';
import {
  bridgeDataRootMatchesSavePath,
  DEFAULT_QBITTORRENT_TIMEOUT_MS,
  requestQbittorrentApi,
  trimQbittorrentBaseUrl,
} from './qbittorrent-http';

interface BridgeHealthPayload {
  targetBaseUrl?: string;
  dataRoot?: string;
  allowedOrigins?: string[];
}

function sanitizedUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    parsed.username = '';
    parsed.password = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return undefined;
  }
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(
    () => controller.abort(new Error('Bridge health request timed out')),
    timeoutMs,
  );
  try {
    return await fetchImpl(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

function healthResult(
  status: QbittorrentBridgeHealth['status'],
  message: string,
  payload: BridgeHealthPayload | null = null,
): QbittorrentBridgeHealth {
  return {
    status,
    message,
    targetBaseUrl: sanitizedUrl(payload?.targetBaseUrl),
    dataRoot: payload?.dataRoot,
    allowedOrigins: payload?.allowedOrigins,
  };
}

export async function checkQbittorrentBridgeHealth(
  fetchImpl: typeof fetch,
  settings: QbittorrentConnectionSettings,
): Promise<QbittorrentBridgeHealth> {
  const baseUrl = trimQbittorrentBaseUrl(settings.baseUrl);
  const timeoutMs = settings.timeoutMs || DEFAULT_QBITTORRENT_TIMEOUT_MS;
  let healthResponse: Response;
  try {
    healthResponse = await fetchWithTimeout(
      fetchImpl,
      `${baseUrl}/__health`,
      timeoutMs,
    );
  } catch {
    return healthResult(
      'not_running',
      `The local qBittorrent bridge is not reachable at ${baseUrl}. Run the helper command from Project settings and retry.`,
    );
  }
  if (healthResponse.status === 403) {
    return healthResult(
      'origin_blocked',
      'The local qBittorrent bridge rejected this browser origin. Restart the bridge with the allowed origin shown in Project settings.',
    );
  }
  if (!healthResponse.ok) {
    return healthResult(
      'not_running',
      `The configured qBittorrent URL did not expose the bridge health endpoint (HTTP ${healthResponse.status}). Use the bridge URL, normally http://127.0.0.1:8787.`,
    );
  }
  const payload = (await healthResponse
    .json()
    .catch(() => null)) as BridgeHealthPayload | null;
  if (!bridgeDataRootMatchesSavePath(payload?.dataRoot, settings.savePath)) {
    return healthResult(
      'data_root_mismatch',
      `The bridge is running with data root ${payload?.dataRoot ?? '(unknown)'}, but this project is configured for ${settings.savePath}. Stop the existing bridge and restart it from Project settings so qBittorrent and the app read/write the same document folder.`,
      payload,
    );
  }
  try {
    const version = await requestQbittorrentApi(
      fetchImpl,
      baseUrl,
      '/app/version',
      { method: 'GET' },
      '',
      timeoutMs,
    );
    await version.text();
  } catch (error) {
    return healthResult(
      'qbit_unreachable',
      error instanceof Error
        ? `The bridge is running, but qBittorrent is not reachable through it: ${error.message}`
        : 'The bridge is running, but qBittorrent is not reachable through it.',
      payload,
    );
  }
  return healthResult(
    'ok',
    'The local bridge and qBittorrent Web API are reachable.',
    payload,
  );
}
