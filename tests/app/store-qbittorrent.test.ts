import { describe, expect, it, vi } from 'vitest';

import { createPlannerStore } from '../../src/app/store';
import { createPlannerEngine } from '../../src/core/engine';
import { plannerClock } from '../../src/core/time';
import type {
  EnrichmentProvider,
  QbittorrentIntegrationService,
  QbittorrentPluginInfo,
} from '../../src/core/types';
import { makeProject, silentLogger } from './store-test-utils';

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('store qBittorrent settings', () => {
  it('stores qBittorrent connection settings locally without exporting credentials', () => {
    const savedConnections: unknown[] = [];
    const store = createPlannerStore({
      initialProject: makeProject(),
      engine: createPlannerEngine({
        clock: plannerClock,
        logger: silentLogger,
      }),
      enrichmentProvider: {
        fetchBook: vi.fn(),
        searchBooks: vi.fn(),
      } as unknown as EnrichmentProvider,
      logger: silentLogger,
      clock: plannerClock,
      localSettings: {
        loadQbittorrentConnection: () => undefined,
        saveQbittorrentConnection: (settings) => {
          savedConnections.push(settings);
        },
        loadAiConnection: () => undefined,
        saveAiConnection: () => undefined,
      },
    });

    store.commands.updateQbittorrentLocalSettings({
      enabled: true,
      baseUrl: 'http://127.0.0.1:8080',
      username: 'connor',
      password: 'local-secret',
    });
    store.commands.updateSourceSettings({
      documentSources: {
        ...store.selectors.getProject().sourceSettings.documentSources,
        qbittorrent: true,
      },
    });

    const exported = JSON.parse(store.exportProject()) as Record<
      string,
      unknown
    >;
    expect(savedConnections).toHaveLength(1);
    expect(JSON.stringify(exported)).not.toContain('local-secret');
    expect(exported).toHaveProperty('sourceSettings');
    expect(exported).not.toHaveProperty('qbittorrentConnection');
  });

  it('prepares qBittorrent quick-start settings without exporting credentials', () => {
    const savedConnections: unknown[] = [];
    const store = createPlannerStore({
      initialProject: makeProject(),
      engine: createPlannerEngine({
        clock: plannerClock,
        logger: silentLogger,
      }),
      enrichmentProvider: {
        fetchBook: vi.fn(),
        searchBooks: vi.fn(),
      } as unknown as EnrichmentProvider,
      logger: silentLogger,
      clock: plannerClock,
      localSettings: {
        loadQbittorrentConnection: () => undefined,
        saveQbittorrentConnection: (settings) => {
          savedConnections.push(settings);
        },
        loadAiConnection: () => undefined,
        saveAiConnection: () => undefined,
      },
    });

    store.commands.updateQbittorrentLocalSettings({ password: 'local-secret' });
    store.commands.prepareQbittorrentQuickStart();
    const state = store.selectors.getState();
    const exported = store.exportProject();

    expect(savedConnections).toHaveLength(2);
    expect(state.ui.qbittorrentConnection.enabled).toBe(true);
    expect(state.ui.qbittorrentConnection.baseUrl).toBe(
      'http://127.0.0.1:8787',
    );
    expect(state.project.sourceSettings.documentSources.qbittorrent).toBe(true);
    expect(state.project.sourceSettings.qbittorrent.searchPlugins).toBe(true);
    expect(
      state.project.sourceSettings.qbittorrent.requireKnownAccessBasis,
    ).toBe(true);
    expect(state.project.sourceSettings.qbittorrent.allowedSites).toEqual(
      expect.arrayContaining([
        'archive.org',
        'gutenberg.org',
        'standardebooks.org',
      ]),
    );
    expect(exported).not.toContain('local-secret');
  });

  it('passes source masks and local qBittorrent settings into enrichment requests', async () => {
    const fetchBook = vi.fn(
      async ({ book, sourceSettings, qbittorrentConnection }) => ({
        cacheKey: book.id,
        bookPatch: {},
        enrichment: book.enrichment,
        provenance: [
          {
            provider:
              sourceSettings.documentSources.qbittorrent &&
              qbittorrentConnection?.enabled
                ? 'qbittorrent'
                : 'test',
            fetchedAt: '2026-01-05T00:00:00.000Z',
            confidence: 1,
          },
        ],
      }),
    );
    const store = createPlannerStore({
      initialProject: makeProject(),
      engine: createPlannerEngine({
        clock: plannerClock,
        logger: silentLogger,
      }),
      enrichmentProvider: {
        fetchBook,
        searchBooks: vi.fn(),
      } as unknown as EnrichmentProvider,
      logger: silentLogger,
      clock: plannerClock,
    });

    store.commands.updateSourceSettings({
      documentSources: {
        ...store.selectors.getProject().sourceSettings.documentSources,
        qbittorrent: true,
      },
    });
    store.commands.updateQbittorrentLocalSettings({ enabled: true });
    await store.commands.refreshBookEnrichment('book-1');

    expect(fetchBook).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceSettings: expect.objectContaining({
          documentSources: expect.objectContaining({ qbittorrent: true }),
        }),
        qbittorrentConnection: expect.objectContaining({ enabled: true }),
      }),
    );
  });

  it('warns instead of testing qBittorrent while disabled', async () => {
    const qbittorrentService: QbittorrentIntegrationService = {
      testConnection: vi.fn(),
      listPlugins: vi.fn(),
      findDocumentCandidates: vi.fn(),
      acquireDocumentCandidate: vi.fn(),
      deleteTorrent: vi.fn(),
    };
    const store = createPlannerStore({
      initialProject: makeProject(),
      engine: createPlannerEngine({
        clock: plannerClock,
        logger: silentLogger,
      }),
      enrichmentProvider: {
        fetchBook: vi.fn(),
        searchBooks: vi.fn(),
      } as unknown as EnrichmentProvider,
      qbittorrentService,
      logger: silentLogger,
      clock: plannerClock,
    });

    await store.commands.testQbittorrentConnection();

    expect(qbittorrentService.testConnection).not.toHaveBeenCalled();
    expect(store.selectors.getState().ui.banner?.tone).toBe('warn');
    expect(store.selectors.getState().ui.qbittorrentStatus.message).toContain(
      'disabled',
    );
  });

  it('surfaces bridge health failures before qBittorrent API tests', async () => {
    const qbittorrentService: QbittorrentIntegrationService = {
      checkBridgeHealth: vi.fn(async () => ({
        status: 'not_running' as const,
        message:
          'The local qBittorrent bridge is not reachable at http://127.0.0.1:8787.',
      })),
      testConnection: vi.fn(),
      listPlugins: vi.fn(),
      findDocumentCandidates: vi.fn(),
      acquireDocumentCandidate: vi.fn(),
      deleteTorrent: vi.fn(),
    };
    const store = createPlannerStore({
      initialProject: makeProject(),
      engine: createPlannerEngine({
        clock: plannerClock,
        logger: silentLogger,
      }),
      enrichmentProvider: {
        fetchBook: vi.fn(),
        searchBooks: vi.fn(),
      } as unknown as EnrichmentProvider,
      qbittorrentService,
      logger: silentLogger,
      clock: plannerClock,
    });
    store.commands.updateQbittorrentLocalSettings({ enabled: true });

    const ok = await store.commands.testQbittorrentConnection();

    expect(ok).toBe(false);
    expect(qbittorrentService.testConnection).not.toHaveBeenCalled();
    expect(store.selectors.getState().ui.qbittorrentStatus).toMatchObject({
      state: 'failed',
      message:
        'The local qBittorrent bridge is not reachable at http://127.0.0.1:8787.',
    });
  });

  it('passes metadata-only enrichment options through refresh commands', async () => {
    const fetchBook = vi.fn(async ({ book }) => ({
      cacheKey: book.id,
      bookPatch: {},
      enrichment: book.enrichment,
      provenance: [
        {
          provider: 'test',
          fetchedAt: '2026-01-05T00:00:00.000Z',
          confidence: 1,
        },
      ],
    }));
    const store = createPlannerStore({
      initialProject: makeProject(),
      engine: createPlannerEngine({
        clock: plannerClock,
        logger: silentLogger,
      }),
      enrichmentProvider: {
        fetchBook,
        searchBooks: vi.fn(),
      } as unknown as EnrichmentProvider,
      logger: silentLogger,
      clock: plannerClock,
    });

    await store.commands.refreshBookEnrichment('book-1', {
      skipBridgeDocuments: true,
    });

    expect(fetchBook).toHaveBeenCalledWith(
      expect.objectContaining({ skipBridgeDocuments: true }),
    );
  });

  it('ignores stale connection test results after local settings change', async () => {
    const connectionResult = createDeferred<void>();
    const qbittorrentService: QbittorrentIntegrationService = {
      testConnection: vi.fn(() => connectionResult.promise),
      listPlugins: vi.fn(),
      findDocumentCandidates: vi.fn(),
      acquireDocumentCandidate: vi.fn(),
      deleteTorrent: vi.fn(),
    };
    const store = createPlannerStore({
      initialProject: makeProject(),
      engine: createPlannerEngine({
        clock: plannerClock,
        logger: silentLogger,
      }),
      enrichmentProvider: {
        fetchBook: vi.fn(),
        searchBooks: vi.fn(),
      } as unknown as EnrichmentProvider,
      qbittorrentService,
      logger: silentLogger,
      clock: plannerClock,
    });

    const pendingTest = store.commands.testQbittorrentConnection();
    store.commands.updateQbittorrentLocalSettings({
      enabled: true,
      baseUrl: 'http://127.0.0.1:8788',
    });
    connectionResult.resolve(undefined);
    await pendingTest;

    const state = store.selectors.getState();
    expect(state.ui.qbittorrentStatus.state).toBe('idle');
    expect(state.ui.qbittorrentStatus.message).toBe(
      'qBittorrent settings saved locally.',
    );
    expect(state.ui.banner?.message).not.toBe(
      'qBittorrent connection succeeded.',
    );
  });

  it('ignores stale plugin refresh results after local settings change', async () => {
    const plugins: QbittorrentPluginInfo[] = [
      {
        name: 'plugin-a',
        fullName: 'Plugin A',
        enabled: true,
        url: 'https://example.org',
        supportedCategories: [],
      },
    ];
    const pluginResult = createDeferred<QbittorrentPluginInfo[]>();
    const qbittorrentService: QbittorrentIntegrationService = {
      testConnection: vi.fn(),
      listPlugins: vi.fn(() => pluginResult.promise),
      findDocumentCandidates: vi.fn(),
      acquireDocumentCandidate: vi.fn(),
      deleteTorrent: vi.fn(),
    };
    const store = createPlannerStore({
      initialProject: makeProject(),
      engine: createPlannerEngine({
        clock: plannerClock,
        logger: silentLogger,
      }),
      enrichmentProvider: {
        fetchBook: vi.fn(),
        searchBooks: vi.fn(),
      } as unknown as EnrichmentProvider,
      qbittorrentService,
      logger: silentLogger,
      clock: plannerClock,
    });

    const pendingRefresh = store.commands.refreshQbittorrentPlugins();
    store.commands.updateQbittorrentLocalSettings({
      enabled: true,
      baseUrl: 'http://127.0.0.1:8789',
    });
    pluginResult.resolve(plugins);
    await pendingRefresh;

    const state = store.selectors.getState();
    expect(state.ui.qbittorrentStatus.state).toBe('idle');
    expect(state.ui.qbittorrentStatus.plugins).toEqual([]);
    expect(state.ui.qbittorrentStatus.message).toBe(
      'qBittorrent settings saved locally.',
    );
  });
});
