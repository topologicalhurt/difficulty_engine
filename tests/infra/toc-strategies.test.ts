import { describe, expect, it } from 'vitest';

import { createDefaultSourceSettings } from '../../src/core/defaults';
import type { BookRecord } from '../../src/core/types';
import { mergeStrategyCandidates } from '../../src/infra/toc-merge';
import { resolveBookEnrichment } from '../../src/infra/toc-strategies';

function makeBook(): BookRecord {
  return {
    id: 'book-1',
    title: 'Signals and Systems',
    short: 'Signals',
    authors: ['A. Author'],
    displayGroup: 'Core',
    manualSeedDifficulty: 5,
    pages: 250,
    subjects: [],
    publisher: '',
    isbn: '9781234567897',
    year: null,
    sourcePath: null,
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
      description: '',
      olSubjects: [],
      tocSource: 'none',
    },
  };
}

describe('resolveBookEnrichment', () => {
  it('prefers a fetchable local PDF source before network metadata', async () => {
    const book = makeBook();
    book.sourcePath = 'https://example.test/book.pdf';

    const resolution = await resolveBookEnrichment({
      book,
      fetchJson: async () => ({}) as never,
      fetchImpl: async () =>
        new Response(
          '/Title (Contents) /Title (Chapter 1 Signals) /Title (Chapter 2 Systems)',
          {
            status: 200,
            headers: { 'content-type': 'application/pdf' },
          },
        ),
    });

    expect(resolution.enrichment.chapters).toEqual([
      'Contents',
      'Chapter 1 Signals',
      'Chapter 2 Systems',
    ]);
    expect(resolution.enrichment.tocSource).toBe('pdf');
    expect(resolution.provenance[0]?.provider).toBe('direct_url');
  });

  it('rejects oversized direct document responses before TOC extraction', async () => {
    const book = makeBook();
    book.sourcePath = 'https://example.test/huge.pdf';
    const sourceSettings = createDefaultSourceSettings();
    sourceSettings.metadataSources.openlibrary = false;
    sourceSettings.metadataSources.googleBooks = false;
    sourceSettings.metadataSources.internetArchive = false;
    sourceSettings.documentSources.internetArchiveText = false;

    const resolution = await resolveBookEnrichment({
      book,
      sourceSettings,
      fetchJson: async () => ({}) as never,
      fetchImpl: async () =>
        new Response('/Title (Contents) /Title (Chapter 1 Should Not Load)', {
          status: 200,
          headers: {
            'content-type': 'application/pdf',
            'content-length': String(9 * 1024 * 1024),
          },
        }),
    });

    expect(resolution.enrichment.chapters).toEqual([]);
    expect(resolution.provenance).toEqual([]);
  });

  it('does not fetch non-remote or insecure external source paths from the browser context', async () => {
    const fetchCalls: string[] = [];
    const fetchImpl = async (
      url: string | URL | Request,
    ): Promise<Response> => {
      fetchCalls.push(String(url));
      return new Response('Chapter 1 Should Not Load', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      });
    };
    const localBook = makeBook();
    localBook.sourcePath = '/Users/connor/private/book.pdf';
    const insecureBook = makeBook();
    insecureBook.sourcePath = 'http://example.test/book.pdf';

    await resolveBookEnrichment({
      book: localBook,
      fetchJson: async () => ({}) as never,
      fetchImpl,
    });
    await resolveBookEnrichment({
      book: insecureBook,
      fetchJson: async () => ({}) as never,
      fetchImpl,
    });

    expect(fetchCalls).toEqual([]);
  });

  it('falls back to Open Library and Google Books to fill metadata without treating blurbs as TOCs', async () => {
    const book = makeBook();
    const fetchJson = async <T>(url: string): Promise<T> => {
      if (url === 'https://openlibrary.org/isbn/9781234567897.json') {
        return {
          key: '/books/OL123M',
          title: 'Signals and Systems',
          authors: [{ key: '/authors/OLA1' }],
          publish_date: '2004',
          publishers: ['OL Press'],
          subjects: ['signals', 'systems'],
          works: [{ key: '/works/OL123W' }],
          number_of_pages: 612,
        } as T;
      }
      if (url === 'https://openlibrary.org/authors/OLA1.json') {
        return { name: 'A. Author' } as T;
      }
      if (url === 'https://openlibrary.org/works/OL123W.json') {
        return {
          description: 'Open Library work description.',
          subjects: ['engineering'],
        } as T;
      }
      if (url.startsWith('https://openlibrary.org/search.json?')) {
        return { docs: [] } as T;
      }
      if (url.startsWith('https://www.googleapis.com/books/v1/volumes?')) {
        return {
          items: [
            {
              id: 'google-1',
              volumeInfo: {
                title: 'Signals and Systems',
                authors: ['A. Author'],
                description:
                  'This new edition includes a chapter on the latest microcontrollers and new sections covering test equipment.',
                categories: ['Electrical engineering'],
                pageCount: 620,
              },
            },
          ],
        } as T;
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const resolution = await resolveBookEnrichment({
      book,
      fetchJson,
    });

    expect(resolution.bookPatch.pages).toBe(612);
    expect(resolution.bookPatch.publisher).toBe('OL Press');
    expect(resolution.bookPatch.openLibraryEditionKey).toBe('/books/OL123M');
    expect(resolution.bookPatch.googleBooksId).toBe('google-1');
    expect(resolution.enrichment.description).toBe(
      'Open Library work description.',
    );
    expect(resolution.enrichment.olSubjects).toEqual(
      expect.arrayContaining([
        'signals',
        'systems',
        'engineering',
        'Electrical engineering',
      ]),
    );
    expect(resolution.enrichment.chapters).toEqual([]);
    expect(resolution.provenance.map((entry) => entry.provider)).toEqual(
      expect.arrayContaining(['openlibrary', 'google_books']),
    );
  });

  it('allows explicit Google Books TOC text but rejects ordinary chapter marketing copy', async () => {
    const book = makeBook();
    book.isbn = null;
    const fetchJson = async <T>(url: string): Promise<T> => {
      if (url.startsWith('https://openlibrary.org/search.json?')) {
        return { docs: [] } as T;
      }
      if (url.startsWith('https://www.googleapis.com/books/v1/volumes?')) {
        return {
          items: [
            {
              id: 'google-blurb',
              volumeInfo: {
                title: 'Marketing Blurb',
                description:
                  'Includes a chapter on the latest microcontrollers and new sections covering test equipment.',
              },
            },
            {
              id: 'google-toc',
              volumeInfo: {
                title: 'Signals and Systems',
                description: 'Contents. Chapter 1 Signals. Chapter 2 Systems.',
              },
            },
          ],
        } as T;
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const resolution = await resolveBookEnrichment({ book, fetchJson });

    expect(resolution.enrichment.chapters).toEqual([
      'Contents',
      'Chapter 1 Signals',
      'Chapter 2 Systems',
    ]);
    expect(resolution.enrichment.chapters).not.toContain(
      'chapter on the latest microcontrollers',
    );
  });

  it('replaces stale non-manual imported chapters with a completed PDF TOC', async () => {
    const book = makeBook();
    book.enrichment.tocSource = 'google_books';
    book.enrichment.chapters = [
      'chapter on the latest microcontrollers',
      'chapter New sections covering test equipment, optoelectronics, microcontroller circuits, and more',
    ];

    const resolution = await resolveBookEnrichment({
      book,
      fetchJson: async () => ({ docs: [] }) as never,
      acquiredDocuments: [
        {
          candidateId: 'doc-1',
          provider: 'qbittorrent',
          sourceUrl: 'magnet:?xt=urn:btih:fixture',
          storagePath: '/tmp/practical-electronics.pdf',
          contentType: 'application/pdf',
          accessBasis: 'user_provided',
          confidence: 0.9,
          text: [
            'CONTENTS',
            'CHAPTER 1 Introduction to Electronics 1',
            'CHAPTER 2 Theory 5',
            'CHAPTER 3 Basic Electronic Circuit Components 253',
          ].join('\n'),
          acquiredAt: '2026-01-05T00:00:00.000Z',
        },
      ],
    });

    expect(resolution.enrichment.tocSource).toBe('pdf');
    expect(resolution.enrichment.chapters).toEqual([
      'CONTENTS',
      'CHAPTER 1 Introduction to Electronics',
      'CHAPTER 2 Theory',
      'CHAPTER 3 Basic Electronic Circuit Components',
    ]);
    expect(resolution.enrichment.provenance?.chapters?.provider).toBe(
      'qbittorrent',
    );
  });

  it('uses Internet Archive text as an additional online TOC source', async () => {
    const book = makeBook();
    book.isbn = null;
    const fetchJson = async <T>(url: string): Promise<T> => {
      if (url.startsWith('https://archive.org/advancedsearch.php?')) {
        return {
          response: {
            docs: [
              {
                identifier: 'signals-fixture',
                title: 'Signals and Systems',
                creator: 'A. Author',
              },
            ],
          },
        } as T;
      }
      if (url === 'https://archive.org/metadata/signals-fixture') {
        return {
          metadata: {
            title: 'Signals and Systems',
            subject: ['Signal processing', 'Systems engineering'],
          },
          files: [
            {
              name: 'signals-fixture_djvu.txt',
              format: 'DjVuTXT',
              size: '1200',
            },
          ],
        } as T;
      }
      if (url.startsWith('https://openlibrary.org/search.json?')) {
        return { docs: [] } as T;
      }
      if (url.startsWith('https://www.googleapis.com/books/v1/volumes?')) {
        return { items: [] } as T;
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const resolution = await resolveBookEnrichment({
      book,
      fetchJson,
      fetchImpl: async () =>
        new Response(
          [
            'Contents',
            'Chapter 1 Signals 1',
            'Chapter 2 Systems 37',
            'Appendix A Transform Tables 201',
          ].join('\n'),
          { status: 200, headers: { 'content-type': 'text/plain' } },
        ),
    });

    expect(resolution.enrichment.tocSource).toBe('internet_archive');
    expect(resolution.enrichment.chapters).toEqual([
      'Contents',
      'Chapter 1 Signals',
      'Chapter 2 Systems',
      'Appendix A Transform Tables',
    ]);
    expect(resolution.enrichment.olSubjects).toEqual(
      expect.arrayContaining(['Signal processing', 'Systems engineering']),
    );
    expect(resolution.provenance.map((entry) => entry.provider)).toContain(
      'internet_archive',
    );
  });

  it('prefers a much fuller credible TOC over a tiny partial source', () => {
    const book = makeBook();
    const resolution = mergeStrategyCandidates(book, [
      {
        provider: 'direct_url',
        sourceUrl: 'https://example.test/partial.pdf',
        confidence: 0.64,
        chapters: ['Chapter 1 Setup', 'Chapter 2 Basics'],
        tocSource: 'pdf',
        strategy: 'explicit_toc_region',
      },
      {
        provider: 'internet_archive',
        sourceUrl: 'https://archive.org/details/full',
        confidence: 0.78,
        chapters: [
          'Chapter 1 Setup',
          'Chapter 2 Basics',
          'Chapter 3 Components',
          'Chapter 4 Instruments',
          'Chapter 5 Filters',
          'Chapter 6 Oscillators',
          'Chapter 7 Microcontrollers',
          'Appendix A Reference Tables',
        ],
        tocSource: 'internet_archive',
        strategy: 'explicit_toc_region',
      },
    ]);

    expect(resolution.enrichment.tocSource).toBe('internet_archive');
    expect(resolution.enrichment.chapters).toHaveLength(8);
  });

  it('does not override explicit manual chapters with automated TOCs', () => {
    const book = makeBook();
    const resolution = mergeStrategyCandidates(book, [
      {
        provider: 'manual',
        sourceUrl: 'local://project',
        confidence: 1,
        chapters: ['Chapter 1 Manual Path', 'Chapter 2 Manual Finish'],
        tocSource: 'manual',
      },
      {
        provider: 'internet_archive',
        sourceUrl: 'https://archive.org/details/full',
        confidence: 0.9,
        chapters: Array.from(
          { length: 12 },
          (_, index) => `Chapter ${index + 1} Automated`,
        ),
        tocSource: 'internet_archive',
        strategy: 'explicit_toc_region',
      },
    ]);

    expect(resolution.enrichment.tocSource).toBe('manual');
    expect(resolution.enrichment.chapters).toEqual([
      'Chapter 1 Manual Path',
      'Chapter 2 Manual Finish',
    ]);
  });

  it('does not treat descriptive summary sentences as chapter titles', async () => {
    const book = makeBook();
    book.enrichment.chapters = [
      'Introduction',
      'A comprehensive introduction to the subject that explains the pedagogical arc and describes what readers will learn. This is description text, not a chapter.',
      'Chapter 1 Signals',
    ];

    const resolution = await resolveBookEnrichment({
      book,
      fetchJson: async () => ({ docs: [] }) as never,
    });

    expect(resolution.enrichment.chapters).toEqual([
      'Introduction',
      'Chapter 1 Signals',
    ]);
  });

  it('respects source masks before calling online providers or direct documents', async () => {
    const book = makeBook();
    book.sourcePath = 'https://example.test/book.pdf';
    const sourceSettings = createDefaultSourceSettings();
    sourceSettings.metadataSources.openlibrary = false;
    sourceSettings.metadataSources.googleBooks = false;
    sourceSettings.metadataSources.internetArchive = false;
    sourceSettings.documentSources.directUrl = false;
    sourceSettings.documentSources.internetArchiveText = false;
    const calls: string[] = [];

    const resolution = await resolveBookEnrichment({
      book,
      sourceSettings,
      fetchJson: async (url: string) => {
        calls.push(url);
        return {} as never;
      },
      fetchImpl: async (url: RequestInfo | URL) => {
        calls.push(String(url));
        return new Response('Chapter 1 Should Not Load', { status: 200 });
      },
    });

    expect(calls).toEqual([]);
    expect(resolution.enrichment.chapters).toEqual([]);
    expect(resolution.provenance).toEqual([]);
  });
});
