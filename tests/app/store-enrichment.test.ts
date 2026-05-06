import { describe, expect, it, vi } from 'vitest';

import { createPlannerStore } from '../../src/app/store';
import { EXAMPLE_BOOK } from '../../src/core/defaults';
import { createPlannerEngine } from '../../src/core/engine';
import { plannerClock } from '../../src/core/time';
import type {
  BookRecord,
  EnrichmentProvider,
  SearchBooksResponse,
} from '../../src/core/types';
import {
  makeBook,
  makeProject,
  makeStore,
  silentLogger,
} from './store-test-utils';

function createStoreWithProvider(
  enrichmentProvider: EnrichmentProvider,
  initialProject = makeProject(),
): ReturnType<typeof createPlannerStore> {
  return createPlannerStore({
    initialProject,
    engine: createPlannerEngine({
      clock: plannerClock,
      logger: silentLogger,
    }),
    enrichmentProvider,
    logger: silentLogger,
    clock: plannerClock,
  });
}

describe('store enrichment commands', () => {
  it('refreshes enrichment through the store and records cache provenance', async () => {
    const store = makeStore();
    await store.commands.refreshBookEnrichment('book-1');
    const state = store.selectors.getState();
    expect(state.project.enrichmentCache['book-1']?.status).toBe('success');
    expect(
      state.project.enrichmentCache['book-1']?.provenance?.[0]?.provider,
    ).toBe('test');
    expect(state.project.library.books['book-1']?.subjects).toContain(
      'enriched-subject',
    );
    expect(state.project.library.books['book-1']?.publisher).toBe(
      'Enriched Press',
    );
  });

  it('replaces placeholder page counts with enriched provider page counts', async () => {
    const store = createStoreWithProvider(
      {
        fetchBook: vi.fn(async ({ book }) => ({
          cacheKey: book.id,
          bookPatch: { pages: 412 },
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
      } as unknown as EnrichmentProvider,
      makeProject({
        books: {
          'book-1': makeBook(),
          draft: makeBook({
            id: 'draft',
            title: 'Draft Manual Book',
            short: 'Draft',
            pages: EXAMPLE_BOOK.pages,
            planOrder: 1,
          }),
        },
      }),
    );

    await store.commands.refreshBookEnrichment('draft');

    expect(store.selectors.getBook('draft')?.pages).toBe(412);
  });

  it('keeps user-entered page counts when enrichment returns a different count', async () => {
    const store = createStoreWithProvider(
      {
        fetchBook: vi.fn(async ({ book }) => ({
          cacheKey: book.id,
          bookPatch: { pages: 412 },
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
      } as unknown as EnrichmentProvider,
      makeProject({
        books: {
          manual: makeBook({
            id: 'manual',
            title: 'Manual Pages',
            short: 'Manual',
            pages: 180,
          }),
        },
      }),
    );

    await store.commands.refreshBookEnrichment('manual');

    expect(store.selectors.getBook('manual')?.pages).toBe(180);
  });

  it('ignores stale enrichment responses after source settings change mid-refresh', async () => {
    let releaseFetch!: () => void;
    const fetchGate = new Promise<void>((resolve) => {
      releaseFetch = resolve;
    });
    const enrichmentProvider: EnrichmentProvider = {
      fetchBook: vi.fn(async ({ book }) => {
        await fetchGate;
        return {
          cacheKey: book.id,
          bookPatch: {
            subjects: [...book.subjects, 'stale-enriched-subject'],
            publisher: 'Stale Press',
          },
          enrichment: {
            ...book.enrichment,
            olSubjects: [
              ...book.enrichment.olSubjects,
              'stale-enriched-subject',
            ],
          },
          provenance: [
            {
              provider: 'test',
              fetchedAt: '2026-01-05T00:00:00.000Z',
              confidence: 1,
            },
          ],
        };
      }),
      searchBooks: vi.fn(),
    } as unknown as EnrichmentProvider;
    const store = createStoreWithProvider(enrichmentProvider);

    const refresh = store.commands.refreshBookEnrichment('book-1');
    store.commands.updateSourceSettings({
      metadataSources: {
        ...store.selectors.getProject().sourceSettings.metadataSources,
        openlibrary: false,
      },
    });
    releaseFetch();
    await refresh;

    const state = store.selectors.getState();
    expect(state.project.library.books['book-1']?.publisher).toBe('');
    expect(state.project.library.books['book-1']?.subjects).not.toContain(
      'stale-enriched-subject',
    );
    expect(state.project.enrichmentCache['book-1']?.status).toBe('idle');
    expect(state.project.enrichmentCache['book-1']?.error).toContain(
      'Ignored stale enrichment result',
    );
  });

  it('ignores older enrichment responses for the same cache key', async () => {
    const releases: Array<() => void> = [];
    const enrichmentProvider: EnrichmentProvider = {
      fetchBook: vi.fn(async ({ book }) => {
        const callIndex = releases.length;
        await new Promise<void>((resolve) => {
          releases.push(resolve);
        });
        return {
          cacheKey: book.id,
          bookPatch: {
            publisher: callIndex === 0 ? 'Older Press' : 'Newer Press',
          },
          enrichment: {
            ...book.enrichment,
            description:
              callIndex === 0 ? 'older description' : 'newer description',
          },
          provenance: [
            {
              provider: 'test',
              fetchedAt: '2026-01-05T00:00:00.000Z',
              confidence: 1,
            },
          ],
        };
      }),
      searchBooks: vi.fn(),
    } as unknown as EnrichmentProvider;
    const store = createStoreWithProvider(enrichmentProvider);

    const olderRefresh = store.commands.refreshBookEnrichment('book-1');
    const newerRefresh = store.commands.refreshBookEnrichment('book-1');
    releases[1]?.();
    await newerRefresh;
    releases[0]?.();
    await olderRefresh;

    const book = store.selectors.getBook('book-1');
    expect(book?.publisher).toBe('Newer Press');
    expect(book?.enrichment.description).toBe('newer description');
  });

  it('keeps previous enrichment data stale instead of failed when refresh networking breaks', async () => {
    const baseProject = makeProject();
    const previousData = baseProject.library.books['book-1'].enrichment;
    const store = createStoreWithProvider(
      {
        fetchBook: vi.fn(async () => {
          throw new Error('NetworkError when attempting to fetch resource.');
        }),
        searchBooks: vi.fn(),
      } as unknown as EnrichmentProvider,
      {
        ...baseProject,
        enrichmentCache: {
          'book-1': {
            status: 'success',
            bookId: 'book-1',
            cacheKey: 'book-1',
            fetchedAt: '2026-01-05T00:00:00.000Z',
            data: previousData,
            provenance: [
              {
                provider: 'test',
                fetchedAt: '2026-01-05T00:00:00.000Z',
                confidence: 1,
              },
            ],
          },
        },
      },
    );

    await store.commands.refreshBookEnrichment('book-1');
    const cacheEntry = store.selectors.getProject().enrichmentCache['book-1'];

    expect(cacheEntry?.status).toBe('stale');
    expect(cacheEntry?.data).toEqual(previousData);
    expect(cacheEntry?.error).toContain('NetworkError');
  });

  it('refreshes all enrichment concurrently without exceeding the worker limit', async () => {
    const baseProject = makeProject();
    const books: Record<string, BookRecord> = { ...baseProject.library.books };
    for (let index = 2; index <= 6; index += 1) {
      books[`book-${index}`] = makeBook({
        id: `book-${index}`,
        title: `Test Book ${index}`,
        short: `Book ${index}`,
        planOrder: index - 1,
      });
    }
    let active = 0;
    let maxActive = 0;
    const enrichmentProvider: EnrichmentProvider = {
      fetchBook: vi.fn(async ({ book }) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => {
          setTimeout(resolve, 15);
        });
        active -= 1;
        return {
          cacheKey: book.id,
          bookPatch: {},
          enrichment: {
            ...book.enrichment,
            chapters: [`${book.short} chapter`],
            tocSource: 'openlibrary',
          },
          provenance: [
            {
              provider: 'test',
              fetchedAt: '2026-01-05T00:00:00.000Z',
              confidence: 1,
            },
          ],
        };
      }),
      searchBooks: vi.fn(
        async (): Promise<SearchBooksResponse> => ({
          results: [],
          hasMore: false,
          nextOffset: 0,
          mode: 'search',
        }),
      ),
    };
    const store = createStoreWithProvider(enrichmentProvider, {
      ...baseProject,
      library: { books },
    });

    await store.commands.refreshAllEnrichment();

    expect(maxActive).toBeGreaterThan(1);
    expect(maxActive).toBeLessThanOrEqual(4);
    expect(
      Object.values(store.selectors.getState().project.enrichmentCache),
    ).toHaveLength(6);
    expect(
      Object.values(store.selectors.getState().project.enrichmentCache).every(
        (entry) => entry.status === 'success',
      ),
    ).toBe(true);
  });
});
