import { describe, expect, it, vi } from 'vitest';

import { createPlannerStore } from '../../src/app/store';
import { createPlannerEngine } from '../../src/core/engine';
import { plannerClock } from '../../src/core/time';
import type { BookDocumentRef, QbittorrentIntegrationService } from '../../src/core/types';
import {
  makeBook,
  makeProject,
  makeStore,
  makeTestEnrichmentProvider,
  silentLogger,
} from './store-test-utils';

function documentRef(patch: Partial<BookDocumentRef> = {}): BookDocumentRef {
  return {
    id: 'doc-1',
    provider: 'qbittorrent',
    sourceUrl: 'magnet:?xt=urn:btih:abc123',
    torrentHash: 'abc123',
    fileIndex: 0,
    fileName: 'Test Book.pdf',
    storagePath: '/repo/output/data/documents/Test Book.pdf',
    contentKind: 'pdf',
    contentType: 'application/pdf',
    accessBasis: 'user_owned',
    status: 'downloading',
    matchScore: 0.9,
    availability: {
      seeders: 2,
      peers: 0,
      progress: 0.4,
      state: 'downloading',
    },
    provenance: {
      provider: 'qbittorrent',
      fetchedAt: '2026-01-05T00:00:00.000Z',
      confidence: 0.8,
    },
    createdAt: '2026-01-05T00:00:00.000Z',
    updatedAt: '2026-01-05T00:00:00.000Z',
    ...patch,
  };
}

describe('document metadata commands', () => {
  it('replaces greylisted stalled downloads and deletes old content', async () => {
    const deleteTorrent = vi.fn();
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchImpl);
    const oldDocument = documentRef({
      id: 'old-stalled',
      torrentHash: 'oldhash',
      sourceUrl: 'magnet:?xt=urn:btih:oldhash',
      status: 'stalled',
      storagePath: '/repo/output/data/documents/Old.pdf',
      availability: {
        seeders: 0,
        peers: 0,
        progress: 0.2,
        state: 'stalledDL',
        availability: 0,
        downloadSpeedBytesPerSecond: 0,
      },
    });
    const newDocument = documentRef({
      id: 'new-doc',
      torrentHash: 'newhash',
      sourceUrl: 'magnet:?xt=urn:btih:newhash',
      status: 'downloading',
      storagePath: '/repo/output/data/documents/New.pdf',
      fileName: 'New.pdf',
      availability: {
        seeders: 9,
        peers: 1,
        progress: 0.1,
        state: 'downloading',
      },
    });
    const service: QbittorrentIntegrationService = {
      testConnection: vi.fn(),
      listPlugins: vi.fn(),
      findDocumentCandidates: vi.fn(async () => [
        {
          id: 'candidate-1',
          provider: 'qbittorrent',
          title: 'Test Book',
          sourceUrl: 'magnet:?xt=urn:btih:newhash',
          contentKind: 'pdf' as const,
          accessBasis: 'user_owned' as const,
          confidence: 0.9,
          matchScore: 0.95,
          seeders: 9,
          qualityScore: 0.92,
        },
      ]),
      acquireDocumentCandidate: vi.fn(async () => newDocument),
      deleteTorrent,
    };
    const store = createPlannerStore({
      initialProject: makeProject({
        books: {
          'book-1': makeBook({
            documents: [oldDocument],
            selectedDocumentId: oldDocument.id,
          }),
        },
      }),
      engine: createPlannerEngine({
        clock: plannerClock,
        logger: silentLogger,
      }),
      enrichmentProvider: makeTestEnrichmentProvider(),
      qbittorrentService: service,
      logger: silentLogger,
      clock: plannerClock,
    });

    await store.commands.refreshBookDocumentCandidates('book-1');
    await store.commands.selectBookDocumentCandidate('book-1', 'candidate-1');

    const book = store.selectors.getProject().library.books['book-1'];
    expect(book?.documents?.map((document) => document.id)).toEqual([
      'new-doc',
    ]);
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

  it('clears book metadata while preserving progress and manual planning work', async () => {
    const document = documentRef();
    const store = makeStore({
      initialProject: makeProject({
        books: {
          'book-1': makeBook({
            documents: [document],
            selectedDocumentId: document.id,
            sourcePath: 'magnet:?xt=urn:btih:abc123',
            openLibraryKey: '/works/OL1W',
            openLibraryEditionKey: '/books/OL1M',
            openLibraryWorkKey: '/works/OL1W',
            googleBooksId: 'gb-1',
            manualPrereqs: ['book-2'],
            lockDiff: true,
            enrichment: {
              chapters: ['Old chapter'],
              description: 'Old description',
              olSubjects: ['old'],
              tocSource: 'pdf',
            },
            documentAcquisition: {
              candidateQueue: [
                {
                  id: 'candidate-1',
                  provider: 'qbittorrent',
                  title: 'Test Book',
                  sourceUrl: 'magnet:?xt=urn:btih:abc123',
                  contentKind: 'pdf',
                  accessBasis: 'user_owned',
                  confidence: 0.9,
                },
              ],
              greylist: {},
            },
          }),
          'book-2': makeBook({
            id: 'book-2',
            title: 'Prerequisite Book',
            planOrder: 1,
          }),
        },
        projectPatch: {
          manualOverrides: {
            schedule: { 'book-1': { ds: 2 } },
            deferred: {},
            actuals: {
              '2026-01-06': {
                'book-1': { minutes: 20, pages: 5, done: true },
              },
            },
          },
          enrichmentCache: {
            'book-1': {
              status: 'success',
              bookId: 'book-1',
              cacheKey: 'old',
            },
          },
        },
      }),
    });

    await store.commands.clearBookMetadata('book-1');

    const state = store.selectors.getState();
    const book = state.project.library.books['book-1'];
    expect(book?.documents).toEqual([]);
    expect(book?.selectedDocumentId).toBeNull();
    expect(book?.sourcePath).toBeNull();
    expect(book?.openLibraryKey).toBeNull();
    expect(book?.googleBooksId).toBeNull();
    expect(book?.enrichment.chapters).toEqual([]);
    expect(book?.documentAcquisition?.candidateQueue).toEqual([]);
    expect(book?.manualPrereqs).toEqual(['book-2']);
    expect(book?.lockDiff).toBe(true);
    expect(
      state.project.manualOverrides.actuals['2026-01-06']?.['book-1'],
    ).toEqual({
      minutes: 20,
      pages: 5,
      done: true,
    });
    expect(state.project.enrichmentCache['book-1']?.status).toBe('idle');
  });

  it('clears project metadata and optionally deletes each document once', async () => {
    const deleteTorrent = vi.fn();
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchImpl);
    const sharedDocument = documentRef({
      torrentHash: 'sharedhash',
      sourceUrl: 'magnet:?xt=urn:btih:sharedhash',
      storagePath: '/repo/output/data/documents/Shared.pdf',
    });
    const service: QbittorrentIntegrationService = {
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
            documents: [sharedDocument],
            selectedDocumentId: sharedDocument.id,
          }),
          'book-2': makeBook({
            id: 'book-2',
            title: 'Second Book',
            planOrder: 1,
            documents: [
              { ...sharedDocument, id: 'doc-2', fileName: 'Shared copy.pdf' },
            ],
            selectedDocumentId: 'doc-2',
          }),
        },
      }),
      engine: createPlannerEngine({
        clock: plannerClock,
        logger: silentLogger,
      }),
      enrichmentProvider: makeTestEnrichmentProvider(),
      qbittorrentService: service,
      logger: silentLogger,
      clock: plannerClock,
    });

    await store.commands.clearProjectMetadata({ deleteContent: true });

    const state = store.selectors.getState();
    expect(state.project.library.books['book-1']?.documents).toEqual([]);
    expect(state.project.library.books['book-2']?.documents).toEqual([]);
    expect(deleteTorrent).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
