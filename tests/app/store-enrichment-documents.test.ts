import { describe, expect, it, vi } from 'vitest';

import { createPlannerStore } from '../../src/app/store';
import { createPlannerEngine } from '../../src/core/engine';
import { plannerClock } from '../../src/core/time';
import type {
  BookDocumentRef,
  EnrichmentProvider,
  QbittorrentIntegrationService,
} from '../../src/core/types';
import { makeBook, makeProject, silentLogger } from './store-test-utils';

function documentRef(patch: Partial<BookDocumentRef> = {}): BookDocumentRef {
  return {
    id: 'doc-1',
    provider: 'qbittorrent',
    sourceUrl: 'magnet:?xt=urn:btih:doc1',
    torrentHash: 'doc1',
    fileIndex: 0,
    fileName: 'Test Book.pdf',
    storagePath: '/repo/output/data/documents/Test Book.pdf',
    contentKind: 'pdf',
    contentType: 'application/pdf',
    accessBasis: 'user_owned',
    status: 'downloading',
    matchScore: 0.9,
    availability: {
      seeders: 1,
      peers: 0,
      progress: 0.2,
      state: 'downloading',
    },
    provenance: {
      provider: 'qbittorrent',
      fetchedAt: '2026-01-05T00:00:00.000Z',
      confidence: 0.9,
    },
    createdAt: '2026-01-05T00:00:00.000Z',
    updatedAt: '2026-01-05T00:00:00.000Z',
    ...patch,
  };
}

describe('store enrichment document cleanup', () => {
  it('persists acquisition state and deletes greylisted downloads after replacement', async () => {
    const deleteTorrent = vi.fn();
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchImpl);
    const oldDocument = documentRef({
      id: 'old-doc',
      torrentHash: 'oldhash',
      sourceUrl: 'magnet:?xt=urn:btih:oldhash',
      storagePath: '/repo/output/data/documents/Old.pdf',
      status: 'downloading',
      availability: {
        seeders: 0,
        peers: 0,
        progress: 0.2,
        state: 'downloading',
      },
    });
    const newDocument = documentRef({
      id: 'new-doc',
      torrentHash: 'newhash',
      sourceUrl: 'magnet:?xt=urn:btih:newhash',
      storagePath: '/repo/output/data/documents/New.pdf',
      fileName: 'New.pdf',
      status: 'downloading',
      availability: {
        seeders: 12,
        peers: 1,
        progress: 0.05,
        state: 'downloading',
      },
    });
    const acquisitionState = {
      candidateQueue: [
        {
          id: 'new-candidate',
          provider: 'qbittorrent',
          title: 'Test Book',
          sourceUrl: 'magnet:?xt=urn:btih:newhash',
          contentKind: 'pdf' as const,
          accessBasis: 'user_owned' as const,
          confidence: 0.9,
          matchScore: 0.95,
          qualityScore: 0.9,
        },
      ],
      greylist: {
        'hash:oldhash': {
          key: 'hash:oldhash',
          penalty: 0.36,
          observations: 2,
          lastStatus: 'candidate' as const,
          lastReason: 'Repeated stalled local qBittorrent observation.',
          sourceUrl: 'magnet:?xt=urn:btih:oldhash',
          torrentHash: 'oldhash',
          title: 'Old.pdf',
          updatedAt: '2026-01-05T00:00:00.000Z',
        },
      },
    };
    const enrichmentProvider: EnrichmentProvider = {
      fetchBook: vi.fn(async ({ book }) => ({
        cacheKey: book.id,
        bookPatch: {
          documents: [newDocument],
          selectedDocumentId: newDocument.id,
          documentAcquisition: acquisitionState,
        },
        enrichment: book.enrichment,
        provenance: [
          {
            provider: 'test',
            fetchedAt: '2026-01-05T00:00:00.000Z',
            confidence: 1,
          },
        ],
      })),
      searchBooks: vi.fn(),
    };
    const qbittorrentService: QbittorrentIntegrationService = {
      testConnection: vi.fn(),
      listPlugins: vi.fn(),
      findDocumentCandidates: vi.fn(),
      acquireDocumentCandidate: vi.fn(),
      deleteTorrent,
    };
    const store = createPlannerStore({
      initialProject: makeProject({
        books: {
          'book-1': makeBook({
            documents: [oldDocument],
            selectedDocumentId: oldDocument.id,
            documentAcquisition: acquisitionState,
          }),
        },
      }),
      engine: createPlannerEngine({ clock: plannerClock, logger: silentLogger }),
      enrichmentProvider,
      qbittorrentService,
      logger: silentLogger,
      clock: plannerClock,
    });

    await store.commands.refreshBookEnrichment('book-1');

    const book = store.selectors.getBook('book-1');
    expect(book?.documents?.map((document) => document.id)).toEqual([
      'new-doc',
    ]);
    expect(book?.documentAcquisition?.candidateQueue[0]?.id).toBe(
      'new-candidate',
    );
    expect(deleteTorrent).toHaveBeenCalledWith(
      expect.anything(),
      'oldhash',
      true,
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('/documents/delete'),
      expect.objectContaining({
        body: JSON.stringify({ path: oldDocument.storagePath }),
      }),
    );
    vi.unstubAllGlobals();
  });

  it('does not delete old content until the replacement has a tracked file', async () => {
    const deleteTorrent = vi.fn();
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchImpl);
    const oldDocument = documentRef({
      id: 'old-doc',
      torrentHash: 'oldhash',
      sourceUrl: 'magnet:?xt=urn:btih:oldhash',
      status: 'stalled',
      availability: {
        seeders: 0,
        peers: 0,
        progress: 0.2,
        state: 'stalledDL',
        availability: 0,
      },
    });
    const untrackedReplacement = documentRef({
      id: 'untracked-doc',
      torrentHash: undefined,
      fileIndex: undefined,
      sourceUrl: 'magnet:?xt=urn:btih:newhash',
      status: 'downloading',
    });
    const acquisitionState = {
      candidateQueue: [],
      greylist: {
        'hash:oldhash': {
          key: 'hash:oldhash',
          penalty: 0.36,
          observations: 2,
          lastStatus: 'stalled' as const,
          torrentHash: 'oldhash',
          updatedAt: '2026-01-05T00:00:00.000Z',
        },
      },
    };
    const enrichmentProvider: EnrichmentProvider = {
      fetchBook: vi.fn(async ({ book }) => ({
        cacheKey: book.id,
        bookPatch: {
          documents: [untrackedReplacement],
          selectedDocumentId: untrackedReplacement.id,
          documentAcquisition: acquisitionState,
        },
        enrichment: book.enrichment,
        provenance: [
          {
            provider: 'test',
            fetchedAt: '2026-01-05T00:00:00.000Z',
            confidence: 1,
          },
        ],
      })),
      searchBooks: vi.fn(),
    };
    const qbittorrentService: QbittorrentIntegrationService = {
      testConnection: vi.fn(),
      listPlugins: vi.fn(),
      findDocumentCandidates: vi.fn(),
      acquireDocumentCandidate: vi.fn(),
      deleteTorrent,
    };
    const store = createPlannerStore({
      initialProject: makeProject({
        books: {
          'book-1': makeBook({
            documents: [oldDocument],
            selectedDocumentId: oldDocument.id,
            documentAcquisition: acquisitionState,
          }),
        },
      }),
      engine: createPlannerEngine({ clock: plannerClock, logger: silentLogger }),
      enrichmentProvider,
      qbittorrentService,
      logger: silentLogger,
      clock: plannerClock,
    });

    await store.commands.refreshBookEnrichment('book-1');

    expect(deleteTorrent).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalledWith(
      expect.stringContaining('/documents/delete'),
      expect.anything(),
    );
    vi.unstubAllGlobals();
  });

  it('does not delete hashes queued by another book', async () => {
    const deleteTorrent = vi.fn();
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchImpl);
    const oldDocument = documentRef({
      id: 'old-doc',
      torrentHash: 'sharedhash',
      sourceUrl: 'magnet:?xt=urn:btih:sharedhash',
      status: 'stalled',
      availability: {
        seeders: 0,
        peers: 0,
        progress: 0.2,
        state: 'stalledDL',
        availability: 0,
      },
    });
    const newDocument = documentRef({
      id: 'new-doc',
      torrentHash: 'newhash',
      sourceUrl: 'magnet:?xt=urn:btih:newhash',
      fileName: 'New.pdf',
    });
    const enrichmentProvider: EnrichmentProvider = {
      fetchBook: vi.fn(async ({ book }) => ({
        cacheKey: book.id,
        bookPatch: {
          documents: [newDocument],
          selectedDocumentId: newDocument.id,
          documentAcquisition: book.documentAcquisition,
        },
        enrichment: book.enrichment,
        provenance: [
          {
            provider: 'test',
            fetchedAt: '2026-01-05T00:00:00.000Z',
            confidence: 1,
          },
        ],
      })),
      searchBooks: vi.fn(),
    };
    const qbittorrentService: QbittorrentIntegrationService = {
      testConnection: vi.fn(),
      listPlugins: vi.fn(),
      findDocumentCandidates: vi.fn(),
      acquireDocumentCandidate: vi.fn(),
      deleteTorrent,
    };
    const store = createPlannerStore({
      initialProject: makeProject({
        books: {
          'book-1': makeBook({
            documents: [oldDocument],
            selectedDocumentId: oldDocument.id,
          }),
          'book-2': makeBook({
            id: 'book-2',
            title: 'Other Book',
            planOrder: 1,
            documentAcquisition: {
              candidateQueue: [
                {
                  id: 'shared-candidate',
                  provider: 'qbittorrent',
                  title: 'Other Book',
                  sourceUrl: 'magnet:?xt=urn:btih:sharedhash',
                  contentKind: 'pdf',
                  accessBasis: 'user_owned',
                  confidence: 0.9,
                },
              ],
              greylist: {},
            },
          }),
        },
      }),
      engine: createPlannerEngine({ clock: plannerClock, logger: silentLogger }),
      enrichmentProvider,
      qbittorrentService,
      logger: silentLogger,
      clock: plannerClock,
    });

    await store.commands.refreshBookEnrichment('book-1');

    expect(deleteTorrent).not.toHaveBeenCalledWith(
      expect.anything(),
      'sharedhash',
      true,
    );
    expect(fetchImpl).not.toHaveBeenCalledWith(
      expect.stringContaining('/documents/delete'),
      expect.anything(),
    );
    vi.unstubAllGlobals();
  });
});
