import type { QbittorrentPluginInfo } from '../core/types';
import type { SearchResultsResponse } from './qbittorrent-types';

export type QbittorrentApi = (
  path: string,
  init?: RequestInit,
) => Promise<Response>;

const SEARCH_POLL_ATTEMPTS = 18;
const SEARCH_POLL_INTERVAL_MS = 650;
const MAX_GLOBAL_QBITTORRENT_SEARCHES = 4;

let activeSearches = 0;
const queuedSearches: Array<() => void> = [];

async function withGlobalSearchSlot<T>(task: () => Promise<T>): Promise<T> {
  if (activeSearches >= MAX_GLOBAL_QBITTORRENT_SEARCHES) {
    await new Promise<void>((resolve) => {
      queuedSearches.push(resolve);
    });
  }
  activeSearches += 1;
  try {
    return await task();
  } finally {
    activeSearches = Math.max(0, activeSearches - 1);
    queuedSearches.shift()?.();
  }
}

export function normalizeQbittorrentPlugins(
  items: Array<{
    enabled?: boolean;
    fullName?: string;
    name?: string;
    supportedCategories?: Array<{ id?: string; name?: string }>;
    url?: string;
  }>,
): QbittorrentPluginInfo[] {
  return items
    .map((item) => ({
      name: String(item.name ?? ''),
      fullName: String(item.fullName ?? item.name ?? ''),
      enabled: Boolean(item.enabled),
      url: String(item.url ?? ''),
      supportedCategories: (item.supportedCategories ?? []).map((category) => ({
        id: String(category.id ?? ''),
        name: String(category.name ?? category.id ?? ''),
      })),
    }))
    .filter((plugin) => plugin.name);
}

export async function startQbittorrentSearch(
  api: QbittorrentApi,
  pattern: string,
  pluginsToUse: string,
  category: string,
): Promise<number | null> {
  const body = new URLSearchParams({
    pattern,
    plugins: pluginsToUse,
    category,
  });
  const response = await api('/search/start', {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const payload = (await response.json()) as { id?: number };
  return payload.id ?? null;
}

export async function readQbittorrentSearchResults(
  api: QbittorrentApi,
  id: number,
  limit: number,
  offset = 0,
): Promise<SearchResultsResponse> {
  const response = await api(
    `/search/results?${new URLSearchParams({
      id: String(id),
      limit: String(limit),
      offset: String(offset),
    }).toString()}`,
  );
  return (await response.json()) as SearchResultsResponse;
}

export async function deleteQbittorrentSearch(
  api: QbittorrentApi,
  id: number,
): Promise<void> {
  const body = new URLSearchParams({ id: String(id) });
  await api('/search/delete', {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  }).catch(() => undefined);
}

export async function runQbittorrentPluginSearch(
  api: QbittorrentApi,
  pattern: string,
  pluginName: string,
  category: string,
  limit: number,
): Promise<SearchResultsResponse> {
  return withGlobalSearchSlot(async () => {
    const searchId = await startQbittorrentSearch(
      api,
      pattern,
      pluginName,
      category,
    );
    if (searchId == null) return {};
    try {
      let payload: SearchResultsResponse = {};
      let previousResultCount = -1;
      let stableResultPolls = 0;
      for (let attempt = 0; attempt < SEARCH_POLL_ATTEMPTS; attempt += 1) {
        payload = await readQbittorrentSearchResults(api, searchId, limit);
        const resultCount = payload.results?.length ?? 0;
        if (
          payload.status === 'Stopped' ||
          resultCount >= limit ||
          (resultCount > 0 && stableResultPolls >= 2)
        )
          break;
        stableResultPolls =
          resultCount > 0 && resultCount === previousResultCount
            ? stableResultPolls + 1
            : 0;
        previousResultCount = resultCount;
        await new Promise((resolve) =>
          globalThis.setTimeout(resolve, SEARCH_POLL_INTERVAL_MS),
        );
      }
      return payload;
    } finally {
      await deleteQbittorrentSearch(api, searchId);
    }
  });
}
