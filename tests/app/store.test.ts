import { describe, expect, it, vi } from 'vitest';

import { createPlannerStore } from '../../src/app/store';
import { createPlannerEngine } from '../../src/core/engine';
import { plannerClock } from '../../src/core/time';
import type { BookRecord, EnrichmentProvider, SearchBooksResponse } from '../../src/core/types';
import { makeProject, makeStore, silentLogger } from './store-test-utils';

describe('createPlannerStore', () => {
  it('adds a book and keeps the JSON editor synchronized', () => {
    const store = makeStore();
    store.commands.addBook();
    const state = store.selectors.getState();
    expect(Object.keys(state.project.library.books)).toHaveLength(2);
    expect(JSON.parse(state.ui.importExportText).library.books).toHaveProperty('book-2');
    expect(state.ui.importExportDirty).toBe(false);
  });

  it('updates constraints through the canonical store path', () => {
    const store = makeStore();
    store.commands.updateConstraint('par', 4);
    const state = store.selectors.getState();
    expect(state.project.constraints.par).toBe(4);
    expect(state.snapshot.scheduleStats.totalHours).toBeGreaterThanOrEqual(0);
  });

  it('re-normalizes invalid runtime command input before it becomes authoritative state', () => {
    const store = makeStore();
    store.commands.updateConstraint('par', 0 as never);
    store.commands.updateConstraint('schedAlgo', 'not-real' as never);
    const state = store.selectors.getState();

    expect(state.project.constraints.par).toBe(1);
    expect(state.project.constraints.schedAlgo).toBe('balanced');
  });

  it('keeps manual co-study links symmetric across book editors', () => {
    const store = makeStore();
    store.commands.addBook();
    store.commands.updateBookRelations('book-1', { manualCoStudy: ['book-2'] });
    let state = store.selectors.getState();

    expect(state.project.library.books['book-1']?.manualCoStudy).toEqual(['book-2']);
    expect(state.project.library.books['book-2']?.manualCoStudy).toEqual(['book-1']);
    expect(state.snapshot.relations.some((relation) => relation.type === 'co-study')).toBe(true);

    store.commands.updateBookRelations('book-1', { manualCoStudy: [] });
    state = store.selectors.getState();
    expect(state.project.library.books['book-1']?.manualCoStudy).toEqual([]);
    expect(state.project.library.books['book-2']?.manualCoStudy).toEqual([]);
  });

  it('updates prerequisite dependents from either side of the book graph', () => {
    const store = makeStore();
    store.commands.addBook();
    store.commands.updateBookRelations('book-1', { manualDependents: ['book-2'] });
    let state = store.selectors.getState();

    expect(state.project.library.books['book-2']?.manualPrereqs).toEqual(['book-1']);
    expect(state.snapshot.schedulePlan.graphPrereqsById['book-2']).toContain('book-1');

    store.commands.updateBookRelations('book-2', { manualPrereqs: [] });
    state = store.selectors.getState();
    expect(state.project.library.books['book-2']?.manualPrereqs).toEqual([]);
  });

  it('refreshes enrichment through the store and records cache provenance', async () => {
    const store = makeStore();
    await store.commands.refreshBookEnrichment('book-1');
    const state = store.selectors.getState();
    expect(state.project.enrichmentCache['book-1']?.status).toBe('success');
    expect(state.project.enrichmentCache['book-1']?.provenance?.[0]?.provider).toBe('test');
    expect(state.project.library.books['book-1']?.subjects).toContain('enriched-subject');
    expect(state.project.library.books['book-1']?.publisher).toBe('Enriched Press');
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
            olSubjects: [...book.enrichment.olSubjects, 'stale-enriched-subject'],
          },
          provenance: [{ provider: 'test', fetchedAt: '2026-01-05T00:00:00.000Z', confidence: 1 }],
        };
      }),
      searchBooks: vi.fn(),
    } as unknown as EnrichmentProvider;
    const store = createPlannerStore({
      initialProject: makeProject(),
      engine: createPlannerEngine({ clock: plannerClock, logger: silentLogger }),
      enrichmentProvider,
      logger: silentLogger,
      clock: plannerClock,
    });

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
    expect(state.project.library.books['book-1']?.subjects).not.toContain('stale-enriched-subject');
    expect(state.project.enrichmentCache['book-1']?.status).toBe('idle');
    expect(state.project.enrichmentCache['book-1']?.error).toContain('Ignored stale enrichment result');
  });

  it('keeps previous enrichment data stale instead of failed when refresh networking breaks', async () => {
    const baseProject = makeProject();
    const previousData = baseProject.library.books['book-1'].enrichment;
    const store = createPlannerStore({
      initialProject: {
        ...baseProject,
        enrichmentCache: {
          'book-1': {
            status: 'success',
            bookId: 'book-1',
            cacheKey: 'book-1',
            fetchedAt: '2026-01-05T00:00:00.000Z',
            data: previousData,
            provenance: [{ provider: 'test', fetchedAt: '2026-01-05T00:00:00.000Z', confidence: 1 }],
          },
        },
      },
      engine: createPlannerEngine({ clock: plannerClock, logger: silentLogger }),
      enrichmentProvider: {
        fetchBook: vi.fn(async () => {
          throw new Error('NetworkError when attempting to fetch resource.');
        }),
        searchBooks: vi.fn(),
      } as unknown as EnrichmentProvider,
      logger: silentLogger,
      clock: plannerClock,
    });

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
      books[`book-${index}`] = {
        ...books['book-1'],
        id: `book-${index}`,
        title: `Test Book ${index}`,
        short: `Book ${index}`,
        planOrder: index - 1,
      };
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
          provenance: [{ provider: 'test', fetchedAt: '2026-01-05T00:00:00.000Z', confidence: 1 }],
        };
      }),
      searchBooks: vi.fn(async (): Promise<SearchBooksResponse> => ({
        results: [],
        hasMore: false,
        nextOffset: 0,
        mode: 'search',
      })),
    };
    const store = createPlannerStore({
      initialProject: { ...baseProject, library: { books } },
      engine: createPlannerEngine({ clock: plannerClock, logger: silentLogger }),
      enrichmentProvider,
      logger: silentLogger,
      clock: plannerClock,
    });

    await store.commands.refreshAllEnrichment();

    expect(maxActive).toBeGreaterThan(1);
    expect(maxActive).toBeLessThanOrEqual(4);
    expect(Object.values(store.selectors.getState().project.enrichmentCache)).toHaveLength(6);
    expect(Object.values(store.selectors.getState().project.enrichmentCache).every((entry) => entry.status === 'success')).toBe(true);
  });

  it('searches the catalog and creates a book from a suggestion', async () => {
    const store = makeStore();
    store.commands.setBookSearchQuery('9781234567897');
    await store.commands.searchCatalog();
    let state = store.selectors.getState();
    expect(state.ui.bookSearchResults[0]?.title).toBe('Suggested Search Result');
    store.commands.addBookFromSuggestion(state.ui.bookSearchResults[0]);
    state = store.selectors.getState();
    expect(Object.values(state.project.library.books).some((book) => book.title === 'Suggested Search Result')).toBe(true);
  });

  it('does not add duplicate books from search results', async () => {
    const store = makeStore();
    store.commands.setBookSearchQuery('9781234567897');
    await store.commands.searchCatalog();
    const suggestion = store.selectors.getState().ui.bookSearchResults[0];

    store.commands.addBookFromSuggestion(suggestion);
    store.commands.addBookFromSuggestion(suggestion);

    const state = store.selectors.getState();
    const matchingBooks = Object.values(state.project.library.books).filter(
      (book) => book.title === 'Suggested Search Result',
    );

    expect(matchingBooks).toHaveLength(1);
    expect(Object.keys(state.project.library.books)).toHaveLength(2);
    expect(state.ui.selectedBookId).toBe(matchingBooks[0]?.id ?? null);
  });

  it('moves books through the canonical library order command', () => {
    const store = makeStore();
    store.commands.addBook();
    store.commands.addBook();
    store.commands.updateConstraint('bookOrderPolicy', 'prefer');

    store.commands.moveBook('book-3', 'up');
    const state = store.selectors.getState();

    expect(state.project.library.books['book-3']?.planOrder).toBe(1);
    expect(state.project.library.books['book-2']?.planOrder).toBe(2);
    expect(state.snapshot.schedulePlan.byId['book-3'].scheduleRank).toBeLessThan(
      state.snapshot.schedulePlan.byId['book-2'].scheduleRank,
    );
  });

  it('supports incremental catalog loading', async () => {
    const store = makeStore();
    store.commands.setBookSearchQuery('testing');
    await store.commands.searchCatalog();
    let state = store.selectors.getState();
    expect(state.ui.bookSearchResults).toHaveLength(1);
    expect(state.ui.bookSearchHasMore).toBe(true);

    await store.commands.searchCatalogMore();
    state = store.selectors.getState();
    expect(state.ui.bookSearchResults).toHaveLength(2);
    expect(state.ui.bookSearchHasMore).toBe(false);
  });

  it('drops stale catalog search results when the query changes before completion', async () => {
    let resolveSearch: ((response: SearchBooksResponse) => void) | null = null;
    const store = createPlannerStore({
      initialProject: makeProject(),
      engine: createPlannerEngine({ clock: plannerClock, logger: silentLogger }),
      enrichmentProvider: {
        fetchBook: vi.fn(),
        searchBooks: vi.fn(async () =>
          new Promise<SearchBooksResponse>((resolve) => {
            resolveSearch = resolve;
          }),
        ),
      } as unknown as EnrichmentProvider,
      logger: silentLogger,
      clock: plannerClock,
    });

    store.commands.setBookSearchQuery('alpha');
    const pending = store.commands.searchCatalog();
    store.commands.setBookSearchQuery('');
    const settleSearch = resolveSearch as ((response: SearchBooksResponse) => void) | null;
    if (!settleSearch) throw new Error('Search resolver was not captured');
    settleSearch({
      results: [
        {
          key: 'stale',
          title: 'Stale Result',
          authors: [],
          subtitle: '',
          isbn: null,
          year: null,
          publisher: '',
          subjects: [],
          description: '',
          pages: null,
        },
      ],
      hasMore: false,
      nextOffset: 1,
      mode: 'search',
    });
    await pending;

    const state = store.selectors.getState();
    expect(state.ui.bookSearchQuery).toBe('');
    expect(state.ui.bookSearchResults).toEqual([]);
    expect(state.ui.bookSearchStatus).toBe('idle');
  });

  it('removes stale deferred overrides when a book is deleted', () => {
    const store = makeStore();
    store.commands.loadProject({
      ...makeProject(),
      manualOverrides: {
        schedule: {},
        deferred: {
          '2026-01-06': ['book-1'],
        },
        actuals: {
          '2026-01-06': {
            'book-1': { minutes: 30, done: true },
          },
        },
      },
    });

    store.commands.removeBook('book-1');
    const state = store.selectors.getState();

    expect(state.project.library.books['book-1']).toBeUndefined();
    expect(state.project.manualOverrides.deferred).toEqual({});
    expect(state.project.manualOverrides.actuals).toEqual({});
  });

  it('preserves a manual JSON draft until the user explicitly loads it', () => {
    const store = makeStore();
    store.commands.setImportExportText('{"draft":true}');
    store.commands.addBook();

    let state = store.selectors.getState();
    expect(state.ui.importExportText).toBe('{"draft":true}');
    expect(state.ui.importExportDirty).toBe(true);

    store.commands.setImportExportText(store.exportProject());
    state = store.selectors.getState();
    expect(state.ui.importExportDirty).toBe(false);

    store.commands.addBook();
    state = store.selectors.getState();
    expect(Object.keys(JSON.parse(state.ui.importExportText).library.books)).toHaveLength(3);
    expect(state.ui.importExportDirty).toBe(false);
  });

  it('applies batched constraint updates through one canonical path', () => {
    const store = makeStore();
    store.commands.updateConstraints({
      studyWeekdays: [1, 3],
      weekdaysCustom: true,
      dpw: 2,
    });
    const state = store.selectors.getState();

    expect(state.project.constraints.studyWeekdays).toEqual([1, 3]);
    expect(state.project.constraints.weekdaysCustom).toBe(true);
    expect(state.project.constraints.dpw).toBe(2);
  });

  it('maps days-per-week changes onto the canonical weekday model', () => {
    const store = makeStore();
    store.commands.updateConstraint('dpw', 7);
    const state = store.selectors.getState();

    expect(state.project.constraints.dpw).toBe(7);
    expect(state.project.constraints.weekdaysCustom).toBe(false);
    expect(state.project.constraints.studyWeekdays).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('records calendar completion, actual minutes, actual pages, and deferrals in manual overrides', () => {
    const store = makeStore();
    store.commands.markCalendarEntryDone('2026-01-05', 'book-1');
    store.commands.setCalendarEntryMinutes('2026-01-05', 'book-1', 45);
    store.commands.setCalendarEntryPages('2026-01-05', 'book-1', 12.5);
    let state = store.selectors.getState();

    expect(state.project.manualOverrides.actuals['2026-01-05']?.['book-1']).toEqual({
      done: true,
      minutes: 45,
      pages: 12.5,
    });

    store.commands.deferCalendarEntry('2026-01-05', 'book-1');
    state = store.selectors.getState();
    expect(state.project.manualOverrides.deferred['2026-01-05']).toEqual(['book-1']);
    expect(state.project.manualOverrides.actuals['2026-01-05']).toBeUndefined();
  });

  it('treats actual progress as overriding a previous calendar deferral', () => {
    const store = makeStore();
    store.commands.deferCalendarEntry('2026-01-05', 'book-1');
    store.commands.setCalendarEntryPages('2026-01-05', 'book-1', 9.5);
    let state = store.selectors.getState();

    expect(state.project.manualOverrides.deferred['2026-01-05']).toBeUndefined();
    expect(state.project.manualOverrides.actuals['2026-01-05']?.['book-1']).toEqual({ pages: 9.5 });

    store.commands.markCalendarEntryDone('2026-01-05', 'book-1', true);
    store.commands.markCalendarEntryDone('2026-01-05', 'book-1', false);
    state = store.selectors.getState();
    expect(state.project.manualOverrides.actuals['2026-01-05']?.['book-1']).toEqual({ pages: 9.5 });

    store.commands.clearCalendarEntryActual('2026-01-05', 'book-1');
    state = store.selectors.getState();
    expect(state.project.manualOverrides.actuals['2026-01-05']).toBeUndefined();
  });

});
