import { vi } from 'vitest';

import { createPlannerStore } from '../../src/app/store';
import {
  DEFAULT_CONSTRAINTS,
  createDefaultAiRecommendationSettings,
  createDefaultSourceSettings,
  createDefaultUiPreferences,
} from '../../src/core/defaults';
import { createPlannerEngine } from '../../src/core/engine';
import { plannerClock } from '../../src/core/time';
import type {
  BookRecord,
  ConstraintSet,
  EnrichmentProvider,
  AiRecommendationProvider,
  Logger,
  PlannerComputeAdapter,
  PlannerProjectV1,
  SearchBooksResponse,
  SourceSettings,
} from '../../src/core/types';

export const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

interface TestProjectOptions {
  books?: Record<string, BookRecord>;
  constraints?: Partial<ConstraintSet>;
  sourceSettings?: SourceSettings;
  projectPatch?: Partial<PlannerProjectV1>;
}

interface TestStoreOptions {
  initialProject?: PlannerProjectV1;
  enrichmentProvider?: EnrichmentProvider;
  aiRecommendationProvider?: AiRecommendationProvider;
  computeAdapter?: PlannerComputeAdapter;
  debugUi?: boolean;
}

export function makeBook(patch: Partial<BookRecord> = {}): BookRecord {
  const id = patch.id ?? 'book-1';
  const title = patch.title ?? 'Test Book';
  return {
    id,
    title,
    short: patch.short ?? title,
    authors: ['Test Author'],
    displayGroup: 'Core',
    manualSeedDifficulty: 4,
    pages: 180,
    subjects: ['testing'],
    publisher: '',
    isbn: null,
    year: 2026,
    sourcePath: null,
    documents: [],
    selectedDocumentId: null,
    documentAcquisition: { candidateQueue: [], greylist: {} },
    openLibraryKey: null,
    openLibraryEditionKey: null,
    openLibraryWorkKey: null,
    googleBooksId: null,
    manualPrereqs: [],
    manualCoStudy: [],
    owned: true,
    planOrder: 0,
    allowPrereqOverlap: false,
    lockDiff: false,
    noPropOut: false,
    ignored: false,
    constantRD: false,
    completed: false,
    enrichment: {
      chapters: [],
      topics: [],
      description: '',
      olSubjects: [],
      tocSource: 'none',
    },
    ...patch,
  };
}

export function makeTestEnrichmentProvider(): EnrichmentProvider {
  return {
    fetchBook: vi.fn(async ({ book }) => ({
      cacheKey: book.id,
      bookPatch: {
        pages: book.pages === 250 ? 320 : book.pages,
        subjects: [...book.subjects, 'enriched-subject'],
        publisher: book.publisher || 'Enriched Press',
        openLibraryEditionKey: '/books/OL1M',
      },
      enrichment: {
        ...book.enrichment,
        chapters: book.enrichment.chapters.length
          ? book.enrichment.chapters
          : ['Chapter 1', 'Chapter 2'],
        description: book.enrichment.description || 'Enriched description',
        olSubjects: [...book.enrichment.olSubjects, 'enriched-subject'],
        tocSource: book.enrichment.chapters.length
          ? book.enrichment.tocSource
          : 'openlibrary',
      },
      provenance: [
        {
          provider: 'test',
          fetchedAt: '2026-01-05T00:00:00.000Z',
          confidence: 1,
        },
      ],
    })),
    searchBooks: vi.fn(
      async ({ query, offset = 0 }): Promise<SearchBooksResponse> => ({
        results: [
          {
            key: `${query}-${offset + 1}`,
            title: 'Suggested Search Result',
            authors: ['Search Author'],
            subtitle: 'Search Author · 2025',
            isbn: '9781234567897',
            year: 2025,
            publisher: 'Search Press',
            subjects: ['searching', 'testing'],
            description: 'Pulled from the mocked catalog search.',
            pages: 320,
          },
        ],
        hasMore: offset === 0,
        nextOffset: offset + 1,
        mode: 'search',
      }),
    ),
  };
}

export function makeProject(
  options: TestProjectOptions = {},
): PlannerProjectV1 {
  const base: PlannerProjectV1 = {
    version: 1,
    library: {
      books: options.books ?? { 'book-1': makeBook() },
    },
    manualOverrides: { schedule: {}, deferred: {}, actuals: {} },
    constraints: {
      ...DEFAULT_CONSTRAINTS,
      sd: '2026-01-05',
      ...options.constraints,
    },
    aiRecommendationSettings: createDefaultAiRecommendationSettings(),
    sourceSettings: options.sourceSettings ?? createDefaultSourceSettings(),
    enrichmentCache: {},
    uiPreferences: createDefaultUiPreferences(),
  };
  return { ...base, ...options.projectPatch };
}

export function makeStore(
  options: TestStoreOptions = {},
): ReturnType<typeof createPlannerStore> {
  return createPlannerStore({
    initialProject: options.initialProject ?? makeProject(),
    engine: createPlannerEngine({ clock: plannerClock, logger: silentLogger }),
    computeAdapter: options.computeAdapter,
    enrichmentProvider:
      options.enrichmentProvider ?? makeTestEnrichmentProvider(),
    aiRecommendationProvider: options.aiRecommendationProvider,
    debugUi: options.debugUi,
    logger: silentLogger,
    clock: plannerClock,
  });
}
