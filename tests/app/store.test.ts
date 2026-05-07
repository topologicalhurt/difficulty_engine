import { describe, expect, it, vi } from 'vitest';

import { createPlannerStore } from '../../src/app/store';
import { createPlannerEngine } from '../../src/core/engine';
import { plannerClock } from '../../src/core/time';
import type {
  BookDocumentRef,
  EnrichmentProvider,
  QbittorrentIntegrationService,
  SearchBooksResponse,
} from '../../src/core/types';
import {
  makeBook,
  makeProject,
  makeStore,
  makeTestEnrichmentProvider,
  silentLogger,
} from './store-test-utils';

describe('createPlannerStore', () => {
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

  it('adds a book and keeps the JSON editor synchronized', () => {
    const store = makeStore();
    store.commands.addBook();
    const state = store.selectors.getState();
    expect(Object.keys(state.project.library.books)).toHaveLength(2);
    expect(JSON.parse(state.ui.importExportText).library.books).toHaveProperty(
      'book-2',
    );
    expect(state.ui.importExportDirty).toBe(false);
  });

  it('updates constraints through the canonical store path', () => {
    const store = makeStore();
    store.commands.updateConstraint('par', 4);
    const state = store.selectors.getState();
    expect(state.project.constraints.par).toBe(4);
    expect(state.snapshot.scheduleStats.totalHours).toBeGreaterThanOrEqual(0);
  });

  it('keeps logged calendar history on its real dates when the start date changes', () => {
    const manualOverrides = {
      schedule: {},
      deferred: { '2026-01-07': ['book-1'] },
      actuals: {
        '2026-01-06': {
          'book-1': { minutes: 45, pages: 8, done: true },
        },
        '2026-01-13': {
          'book-1': { minutes: 20, pages: 3 },
        },
      },
    };
    const store = makeStore({
      initialProject: makeProject({ projectPatch: { manualOverrides } }),
    });

    store.commands.updateConstraint('sd', '2026-01-12');
    const state = store.selectors.getState();

    expect(state.project.constraints.sd).toBe('2026-01-12');
    expect(state.project.manualOverrides.actuals).toEqual(
      manualOverrides.actuals,
    );
    expect(state.project.manualOverrides.deferred).toEqual(
      manualOverrides.deferred,
    );
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

    expect(state.project.library.books['book-1']?.manualCoStudy).toEqual([
      'book-2',
    ]);
    expect(state.project.library.books['book-2']?.manualCoStudy).toEqual([
      'book-1',
    ]);
    expect(
      state.snapshot.relations.some((relation) => relation.type === 'co-study'),
    ).toBe(true);

    store.commands.updateBookRelations('book-1', { manualCoStudy: [] });
    state = store.selectors.getState();
    expect(state.project.library.books['book-1']?.manualCoStudy).toEqual([]);
    expect(state.project.library.books['book-2']?.manualCoStudy).toEqual([]);
  });

  it('updates prerequisite dependents from either side of the book graph', () => {
    const store = makeStore();
    store.commands.addBook();
    store.commands.updateBookRelations('book-1', {
      manualDependents: ['book-2'],
    });
    let state = store.selectors.getState();

    expect(state.project.library.books['book-2']?.manualPrereqs).toEqual([
      'book-1',
    ]);
    expect(state.snapshot.schedulePlan.graphPrereqsById['book-2']).toContain(
      'book-1',
    );

    store.commands.updateBookRelations('book-2', { manualPrereqs: [] });
    state = store.selectors.getState();
    expect(state.project.library.books['book-2']?.manualPrereqs).toEqual([]);
  });

  it('searches the catalog and creates a book from a suggestion', async () => {
    const store = makeStore();
    store.commands.setBookSearchQuery('9781234567897');
    await store.commands.searchCatalog();
    let state = store.selectors.getState();
    expect(state.ui.bookSearchResults[0]?.title).toBe(
      'Suggested Search Result',
    );
    store.commands.addBookFromSuggestion(state.ui.bookSearchResults[0]);
    state = store.selectors.getState();
    expect(
      Object.values(state.project.library.books).some(
        (book) => book.title === 'Suggested Search Result',
      ),
    ).toBe(true);
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

  it('does not invent placeholder authors for sparse search results', () => {
    const store = makeStore();
    store.commands.addBookFromSuggestion({
      key: 'sparse',
      title: 'Sparse Search Result',
      authors: [],
      subtitle: '',
      isbn: null,
      year: null,
      publisher: '',
      subjects: [],
      description: '',
      pages: null,
    });

    const added = Object.values(store.selectors.getProject().library.books).find(
      (book) => book.title === 'Sparse Search Result',
    );
    expect(added?.authors).toEqual([]);
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
    expect(
      state.snapshot.schedulePlan.byId['book-3'].scheduleRank,
    ).toBeLessThan(state.snapshot.schedulePlan.byId['book-2'].scheduleRank);
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

  it('removes offline document refs and clears selected document ids', async () => {
    const deleteTorrent = vi.fn();
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchImpl);
    const project = makeProject({
      books: {
        'book-1': makeBook({
          documents: [documentRef()],
          selectedDocumentId: 'doc-1',
        }),
      },
    });
    const store = createPlannerStore({
      initialProject: project,
      engine: createPlannerEngine({
        clock: plannerClock,
        logger: silentLogger,
      }),
      enrichmentProvider: makeTestEnrichmentProvider(),
      qbittorrentService: {
        testConnection: vi.fn(),
        listPlugins: vi.fn(),
        findDocumentCandidates: vi.fn(),
        acquireDocumentCandidate: vi.fn(),
        deleteTorrent,
      } satisfies QbittorrentIntegrationService,
      logger: silentLogger,
      clock: plannerClock,
    });

    await store.commands.removeBookDocument('book-1', 'doc-1', {
      deleteContent: true,
    });

    const book = store.selectors.getProject().library.books['book-1'];
    expect(book?.documents).toEqual([]);
    expect(book?.selectedDocumentId).toBeNull();
    expect(deleteTorrent).toHaveBeenCalledWith(
      expect.anything(),
      'abc123',
      true,
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('/documents/delete'),
      expect.anything(),
    );
    vi.unstubAllGlobals();
  });

  it('loads ranked document candidates and acquires the selected one', async () => {
    const acquired = documentRef({
      id: 'new-doc',
      torrentHash: 'newhash',
      fileName: 'Test Book.epub',
      storagePath: '/repo/output/data/documents/Test Book.epub',
      contentKind: 'epub',
      contentType: 'application/epub+zip',
      status: 'downloading',
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
          contentKind: 'epub' as const,
          accessBasis: 'user_owned' as const,
          confidence: 0.9,
          matchScore: 0.95,
          seeders: 10,
          qualityScore: 0.92,
        },
      ]),
      acquireDocumentCandidate: vi.fn(async () => acquired),
      deleteTorrent: vi.fn(),
    };
    const store = createPlannerStore({
      initialProject: makeProject(),
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

    const state = store.selectors.getState();
    expect(state.ui.documentCandidates.candidates[0]?.id).toBe('candidate-1');
    expect(
      state.project.library.books['book-1']?.documents?.map(
        (document) => document.id,
      ),
    ).toEqual(['new-doc']);
    expect(
      state.project.library.books['book-1']?.documentAcquisition
        ?.candidateQueue[0]?.id,
    ).toBe('candidate-1');
  });

  it('drops stale catalog search results when the query changes before completion', async () => {
    let resolveSearch: ((response: SearchBooksResponse) => void) | null = null;
    const store = createPlannerStore({
      initialProject: makeProject(),
      engine: createPlannerEngine({
        clock: plannerClock,
        logger: silentLogger,
      }),
      enrichmentProvider: {
        fetchBook: vi.fn(),
        searchBooks: vi.fn(
          async () =>
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
    const settleSearch = resolveSearch as
      | ((response: SearchBooksResponse) => void)
      | null;
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
    expect(
      Object.keys(JSON.parse(state.ui.importExportText).library.books),
    ).toHaveLength(3);
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
    expect(state.project.constraints.studyWeekdays).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
  });

  it('records calendar completion, actual minutes, actual pages, and deferrals in manual overrides', () => {
    const store = makeStore();
    store.commands.markCalendarEntryDone('2026-01-05', 'book-1');
    store.commands.setCalendarEntryMinutes('2026-01-05', 'book-1', 45);
    store.commands.setCalendarEntryPages('2026-01-05', 'book-1', 12.5);
    let state = store.selectors.getState();

    expect(
      state.project.manualOverrides.actuals['2026-01-05']?.['book-1'],
    ).toEqual({
      done: true,
      minutes: 45,
      pages: 12.5,
    });

    store.commands.deferCalendarEntry('2026-01-05', 'book-1');
    state = store.selectors.getState();
    expect(state.project.manualOverrides.deferred['2026-01-05']).toEqual([
      'book-1',
    ]);
    expect(state.project.manualOverrides.actuals['2026-01-05']).toBeUndefined();
  });

  it('treats actual progress as overriding a previous calendar deferral', () => {
    const store = makeStore();
    store.commands.deferCalendarEntry('2026-01-05', 'book-1');
    store.commands.setCalendarEntryPages('2026-01-05', 'book-1', 9.5);
    let state = store.selectors.getState();

    expect(
      state.project.manualOverrides.deferred['2026-01-05'],
    ).toBeUndefined();
    expect(
      state.project.manualOverrides.actuals['2026-01-05']?.['book-1'],
    ).toEqual({ pages: 9.5 });

    store.commands.markCalendarEntryDone('2026-01-05', 'book-1', true);
    store.commands.markCalendarEntryDone('2026-01-05', 'book-1', false);
    state = store.selectors.getState();
    expect(
      state.project.manualOverrides.actuals['2026-01-05']?.['book-1'],
    ).toEqual({ pages: 9.5 });

    store.commands.clearCalendarEntryActual('2026-01-05', 'book-1');
    state = store.selectors.getState();
    expect(state.project.manualOverrides.actuals['2026-01-05']).toBeUndefined();
  });
});
