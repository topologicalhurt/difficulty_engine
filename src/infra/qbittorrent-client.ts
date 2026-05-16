import type {
  QbittorrentConnectionSettings,
  QbittorrentPluginInfo,
} from '../core/types';
import type { DocumentCandidate } from './document-acquisition';
import {
  bridgeDocumentExists,
  postBridgeDocumentAction,
  readBridgeByteDocument,
  readBridgeTextDocument,
  requestBridgeEmbeddedPdfText,
  requestBridgePdfStructure,
} from './qbittorrent-document-api';
import type { PageAnchorEvidence } from './toc-page-ranges';
import {
  bridgeDataRootMatchesSavePath,
  DEFAULT_QBITTORRENT_TIMEOUT_MS,
  isAbsoluteStoragePath,
  requestQbittorrentApi,
  trimQbittorrentBaseUrl,
} from './qbittorrent-http';
import {
  normalizeQbittorrentPlugins,
  runQbittorrentPluginSearch,
} from './qbittorrent-plugin-api';
import { hashFromMagnet } from './qbittorrent-selection';
import type {
  SearchResultsResponse,
  TorrentFile,
  TorrentInfo,
} from './qbittorrent-types';

export interface QBittorrentProviderOptions {
  baseUrl: string;
  username: string;
  password: string;
  fetchImpl?: typeof fetch;
  savePath?: string;
  category?: string;
  timeoutMs?: number;
  metadataPollAttempts?: number;
  metadataPollIntervalMs?: number;
}

const DEFAULT_METADATA_POLL_ATTEMPTS = 8;
const DEFAULT_METADATA_POLL_INTERVAL_MS = 250;

export function settingsToOptions(
  settings: QbittorrentConnectionSettings,
  fetchImpl?: typeof fetch,
): QBittorrentProviderOptions {
  return {
    baseUrl: settings.baseUrl,
    username: settings.username,
    password: settings.password,
    savePath: settings.savePath,
    category: settings.category,
    timeoutMs: settings.timeoutMs,
    fetchImpl,
  };
}

export class QBittorrentClient {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private cookie = '';
  private bridgeDataRoot: string | null = null;

  constructor(private readonly options: QBittorrentProviderOptions) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.baseUrl = trimQbittorrentBaseUrl(options.baseUrl);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_QBITTORRENT_TIMEOUT_MS;
  }

  async api(path: string, init: RequestInit = {}): Promise<Response> {
    return requestQbittorrentApi(
      this.fetchImpl,
      this.baseUrl,
      path,
      init,
      this.cookie,
      this.timeoutMs,
    );
  }

  async login(): Promise<void> {
    if (!this.options.username && !this.options.password) {
      const response = await this.api('/app/version');
      await response.text();
      return;
    }
    const body = new URLSearchParams({
      username: this.options.username,
      password: this.options.password,
    });
    const response = await this.api('/auth/login', {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const sid = response.headers.get('set-cookie') ?? '';
    this.cookie = sid.split(';')[0] ?? '';
    const text = await response.text();
    if (!this.cookie && !/Ok\./i.test(text)) {
      throw new Error('qBittorrent authentication failed');
    }
  }

  async effectiveSavePath(): Promise<string | undefined> {
    if (!this.options.savePath) return undefined;
    if (isAbsoluteStoragePath(this.options.savePath))
      return this.options.savePath;
    if (this.bridgeDataRoot) return this.bridgeDataRoot;
    const response = await this.fetchImpl(`${this.baseUrl}/__health`).catch(
      () => null,
    );
    if (!response?.ok) return this.options.savePath;
    const payload = (await response.json().catch(() => null)) as {
      dataRoot?: string;
    } | null;
    this.bridgeDataRoot = payload?.dataRoot || null;
    if (
      this.bridgeDataRoot &&
      !bridgeDataRootMatchesSavePath(this.bridgeDataRoot, this.options.savePath)
    ) {
      throw new Error(
        `qBittorrent bridge data root mismatch: bridge uses ${this.bridgeDataRoot}, but the app is configured for ${this.options.savePath}. Restart the bridge from Project settings.`,
      );
    }
    return this.bridgeDataRoot ?? this.options.savePath;
  }

  async addTorrent(candidate: DocumentCandidate): Promise<void> {
    const body = new FormData();
    body.set('urls', candidate.sourceUrl);
    const savePath = await this.effectiveSavePath();
    if (savePath) body.set('savepath', savePath);
    if (this.options.category) body.set('category', this.options.category);
    const response = await this.api('/torrents/add', { method: 'POST', body });
    const text = await response.text();
    if (/fails?/i.test(text)) {
      throw new Error('qBittorrent rejected the torrent add request.');
    }
  }

  async deleteTorrent(hash: string, deleteFiles: boolean): Promise<void> {
    if (!hash.trim()) return;
    const body = new URLSearchParams({
      hashes: hash,
      deleteFiles: String(deleteFiles),
    });
    await this.api('/torrents/delete', {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  }

  async torrentInfo(candidate: DocumentCandidate): Promise<TorrentInfo | null> {
    const items = await this.listTorrents();
    const hash = hashFromMagnet(candidate.sourceUrl);
    if (hash) {
      const exact = items.find(
        (item) => String(item.hash ?? '').toLowerCase() === hash,
      );
      if (exact) return exact;
    }
    const normalizedTitle = candidate.title.toLowerCase();
    return (
      items.find((item) =>
        String(item.name ?? '')
          .toLowerCase()
          .includes(normalizedTitle),
      ) ?? null
    );
  }

  async waitForTorrentInfo(
    candidate: DocumentCandidate,
  ): Promise<TorrentInfo | null> {
    const attempts =
      this.options.metadataPollAttempts ?? DEFAULT_METADATA_POLL_ATTEMPTS;
    const intervalMs =
      this.options.metadataPollIntervalMs ?? DEFAULT_METADATA_POLL_INTERVAL_MS;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const info = await this.torrentInfo(candidate);
      if (info?.hash) return info;
      if (attempt < attempts - 1 && intervalMs > 0) {
        await new Promise((resolve) =>
          globalThis.setTimeout(resolve, intervalMs),
        );
      }
    }
    return null;
  }

  async listTorrents(): Promise<TorrentInfo[]> {
    const response = await this.api('/torrents/info');
    return (await response.json()) as TorrentInfo[];
  }

  async torrentFiles(hash: string): Promise<TorrentFile[]> {
    const response = await this.api(
      `/torrents/files?${new URLSearchParams({ hash }).toString()}`,
    );
    return (await response.json()) as TorrentFile[];
  }

  async setFilePriority(
    hash: string,
    indexes: number[],
    priority: number,
  ): Promise<void> {
    if (!indexes.length) return;
    const body = new URLSearchParams({
      hash,
      id: indexes.join('|'),
      priority: String(priority),
    });
    await this.api('/torrents/filePrio', {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  }

  async resumeTorrent(hash: string): Promise<void> {
    const body = new URLSearchParams({ hashes: hash });
    await this.api('/torrents/start', {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }).catch(() =>
      this.api('/torrents/resume', {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }).catch(() => undefined),
    );
  }

  async readTextDocument(storagePath: string): Promise<string | undefined> {
    return readBridgeTextDocument(this.fetchImpl, this.baseUrl, storagePath);
  }

  async readByteDocument(storagePath: string): Promise<Uint8Array | undefined> {
    return readBridgeByteDocument(this.fetchImpl, this.baseUrl, storagePath);
  }

  async extractPdfTextDocument(
    storagePath: string,
  ): Promise<string | undefined> {
    return requestBridgeEmbeddedPdfText(
      this.fetchImpl,
      this.baseUrl,
      storagePath,
    );
  }

  async pdfStructureAnchors(
    storagePath: string,
  ): Promise<PageAnchorEvidence[] | undefined> {
    const structure = await requestBridgePdfStructure(
      this.fetchImpl,
      this.baseUrl,
      storagePath,
    );
    return structure?.status === 'complete' ? structure.pageAnchors : undefined;
  }

  async documentExists(storagePath: string): Promise<boolean> {
    return bridgeDocumentExists(this.fetchImpl, this.baseUrl, storagePath);
  }

  async revealDocument(storagePath: string): Promise<void> {
    await postBridgeDocumentAction(
      this.fetchImpl,
      this.baseUrl,
      '/documents/reveal',
      storagePath,
    );
  }

  async deleteDocument(storagePath: string): Promise<void> {
    await postBridgeDocumentAction(
      this.fetchImpl,
      this.baseUrl,
      '/documents/delete',
      storagePath,
    );
  }

  async listPlugins(): Promise<QbittorrentPluginInfo[]> {
    await this.login();
    const response = await this.api('/search/plugins');
    const items = (await response.json()) as Array<{
      enabled?: boolean;
      fullName?: string;
      name?: string;
      supportedCategories?: Array<{ id?: string; name?: string }>;
      url?: string;
    }>;
    return normalizeQbittorrentPlugins(items);
  }

  async runSinglePluginSearch(
    pattern: string,
    pluginName: string,
    category: string,
    limit: number,
  ): Promise<SearchResultsResponse> {
    return runQbittorrentPluginSearch(
      this.api.bind(this),
      pattern,
      pluginName,
      category,
      limit,
    );
  }
}
