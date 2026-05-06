import { describe, expect, it, vi } from 'vitest';

import {
  makeBook,
  makeProject,
  makeStore,
  makeTestEnrichmentProvider,
} from './store-test-utils';

function documentReaderStore() {
  return makeStore({
    initialProject: makeProject({
      books: {
        'book-1': makeBook({
          id: 'book-1',
          title: 'Offline Book',
          short: 'Offline',
          documents: [
            {
              id: 'doc-1',
              provider: 'qbittorrent',
              fileName: 'book.txt',
              storagePath: '/tmp/book.txt',
              contentKind: 'text',
              contentType: 'text/plain',
              accessBasis: 'user_provided',
              status: 'complete',
              matchScore: 1,
              availability: {
                seeders: 1,
                peers: 0,
                progress: 1,
                state: 'complete',
              },
              provenance: {
                provider: 'qbittorrent',
                fetchedAt: '2026-01-05T00:00:00.000Z',
                confidence: 1,
              },
              createdAt: '2026-01-05T00:00:00.000Z',
              updatedAt: '2026-01-05T00:00:00.000Z',
            },
          ],
          selectedDocumentId: 'doc-1',
        }),
      },
    }),
    enrichmentProvider: makeTestEnrichmentProvider(),
  });
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('offline document reader commands', () => {
  it('reads and opens offline document refs through the qBittorrent bridge', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/documents/read-text?')) {
        return new Response('Offline text', { status: 200 });
      }
      if (url.endsWith('/documents/open')) {
        expect(init?.method).toBe('POST');
        expect(String(init?.body)).toContain('/tmp/book.txt');
        return Response.json({ ok: true });
      }
      throw new Error(`Unexpected URL ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const plannerStore = documentReaderStore();

      await plannerStore.commands.readBookDocument('book-1', 'doc-1');
      expect(plannerStore.selectors.getState().ui.documentReader).toMatchObject(
        {
          status: 'ready',
          text: 'Offline text',
          documentId: 'doc-1',
        },
      );

      await plannerStore.commands.openBookDocument('book-1', 'doc-1');
      expect(plannerStore.selectors.getState().ui.banner?.tone).toBe('success');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.stubGlobal('fetch', originalFetch);
    }
  });

  it('does not reopen the reader from a stale read request after close', async () => {
    const originalFetch = globalThis.fetch;
    const readResponse = createDeferred<Response>();
    vi.stubGlobal('fetch', vi.fn(() => readResponse.promise));
    try {
      const plannerStore = documentReaderStore();

      const pendingRead = plannerStore.commands.readBookDocument(
        'book-1',
        'doc-1',
      );
      plannerStore.commands.closeBookDocumentReader();
      readResponse.resolve(new Response('Late offline text', { status: 200 }));
      await pendingRead;

      expect(plannerStore.selectors.getState().ui.documentReader).toMatchObject(
        {
          status: 'idle',
          documentId: null,
          text: '',
        },
      );
    } finally {
      vi.stubGlobal('fetch', originalFetch);
    }
  });
});
