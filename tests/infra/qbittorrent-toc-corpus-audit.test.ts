import { describe, expect, it } from 'vitest';

import { createEmptyProject } from '../../src/core/project-file';
import type { BookRecord, PlannerProjectV1 } from '../../src/core/types';
import {
  buildQbittorrentTocCorpusAudit,
  bookMetadataCompleteness,
} from '../../src/infra/qbittorrent-toc-corpus-audit';
import { normalizeLiveTorrent } from '../../src/infra/qbittorrent-live-inventory';

function book(id: string, patch: Partial<BookRecord> = {}): BookRecord {
  return {
    id,
    title: patch.title ?? 'Fixture Systems',
    short: patch.short ?? 'Fixture Systems',
    authors: patch.authors ?? ['A Author'],
    displayGroup: patch.displayGroup ?? 'Fixture',
    manualSeedDifficulty: patch.manualSeedDifficulty ?? 5,
    isbn: patch.isbn ?? null,
    pages: patch.pages ?? 200,
    publisher: patch.publisher ?? '',
    year: patch.year ?? null,
    subjects: patch.subjects ?? [],
    sourcePath: patch.sourcePath ?? null,
    owned: patch.owned ?? false,
    completed: patch.completed ?? false,
    ignored: patch.ignored ?? false,
    lockDiff: patch.lockDiff ?? false,
    noPropOut: patch.noPropOut ?? false,
    constantRD: patch.constantRD ?? false,
    allowPrereqOverlap: patch.allowPrereqOverlap ?? false,
    planOrder: patch.planOrder ?? 0,
    manualPrereqs: patch.manualPrereqs ?? [],
    manualCoStudy: patch.manualCoStudy ?? [],
    openLibraryKey: patch.openLibraryKey ?? null,
    openLibraryEditionKey: patch.openLibraryEditionKey ?? null,
    openLibraryWorkKey: patch.openLibraryWorkKey ?? null,
    googleBooksId: patch.googleBooksId ?? null,
    documents: patch.documents ?? [],
    selectedDocumentId: patch.selectedDocumentId ?? null,
    documentAcquisition: patch.documentAcquisition,
    readingScope: patch.readingScope,
    enrichment: {
      chapters: patch.enrichment?.chapters ?? [],
      description: patch.enrichment?.description ?? '',
      olSubjects: patch.enrichment?.olSubjects ?? [],
      tocSource: patch.enrichment?.tocSource ?? 'none',
      chapterPageRanges: patch.enrichment?.chapterPageRanges,
    },
  };
}

function project(books: BookRecord[]): PlannerProjectV1 {
  const base = createEmptyProject();
  return {
    ...base,
    library: {
      books: Object.fromEntries(books.map((item) => [item.id, item])),
    },
  };
}

describe('qBittorrent TOC corpus audit', () => {
  it('classifies matched live PDFs separately from missing candidates', () => {
    const audit = buildQbittorrentTocCorpusAudit({
      project: project([
        book('matched', { title: 'Fixture Systems', authors: ['A Author'] }),
        book('missing', { title: 'Different Book', authors: ['C Writer'] }),
      ]),
      inventory: {
        errors: [],
        torrents: [
          normalizeLiveTorrent(
            {
              hash: 'abc',
              name: 'Fixture Systems A Author',
              state: 'downloading',
              progress: 0.2,
              num_seeds: 8,
            },
            [{ index: 0, name: 'Fixture Systems A Author.pdf' }],
          ),
        ],
      },
      generatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(audit.books.find((row) => row.bookId === 'matched')?.failureClass).toBe(
      'pdf_candidate_found',
    );
    expect(audit.books.find((row) => row.bookId === 'missing')?.failureClass).toBe(
      'metadata_sparse',
    );
    expect(audit.summary.pdfCandidates).toBe(1);
  });

  it('marks completed PDFs without chapters as OCR-needed', () => {
    const audit = buildQbittorrentTocCorpusAudit({
      project: project([
        book('pdf', {
          documents: [
            {
              id: 'doc',
              provider: 'qbittorrent',
              fileName: 'Fixture Systems.pdf',
              storagePath: '/repo/output/data/documents/Fixture Systems.pdf',
              contentKind: 'pdf',
              contentType: 'application/pdf',
              accessBasis: 'user_owned',
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
                sourceUrl: 'magnet:?xt=urn:btih:abc',
                fetchedAt: '2026-01-01T00:00:00.000Z',
                confidence: 1,
              },
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        }),
      ]),
      generatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(audit.books[0]?.failureClass).toBe('ocr_needed');
    expect(audit.summary.ocrNeeded).toBe(1);
  });

  it('reports queued refs with completed live PDFs as attachable candidates', () => {
    const audit = buildQbittorrentTocCorpusAudit({
      project: project([
        book('queued', {
          documents: [
            {
              id: 'doc',
              provider: 'qbittorrent',
              fileName: 'Fixture Systems.pdf',
              storagePath: '/repo/output/data/documents/Fixture Systems.pdf',
              torrentHash: 'abc',
              contentKind: 'pdf',
              contentType: 'application/pdf',
              accessBasis: 'user_owned',
              status: 'queued',
              matchScore: 1,
              availability: {
                seeders: 1,
                peers: 0,
                progress: 0,
                state: 'queuedDL',
              },
              provenance: {
                provider: 'qbittorrent',
                sourceUrl: 'magnet:?xt=urn:btih:abc',
                fetchedAt: '2026-01-01T00:00:00.000Z',
                confidence: 1,
              },
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        }),
      ]),
      inventory: {
        errors: [],
        torrents: [
          normalizeLiveTorrent(
            {
              hash: 'abc',
              name: 'Fixture Systems A Author',
              state: 'stalledUP',
              progress: 1,
              amount_left: 0,
              size: 1024,
            },
            [{ index: 0, name: 'Fixture Systems A Author.pdf', progress: 1 }],
          ),
        ],
      },
      generatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(audit.books[0]?.failureClass).toBe('pdf_candidate_found');
    expect(audit.books[0]?.diagnostics).toContain(
      'qBittorrent has completed a matching PDF; refresh enrichment should attach it and run TOC extraction.',
    );
  });

  it('reports persisted qBittorrent refs that are missing from live inventory', () => {
    const audit = buildQbittorrentTocCorpusAudit({
      project: project([
        book('queued', {
          documents: [
            {
              id: 'doc',
              provider: 'qbittorrent',
              fileName: 'Fixture Systems.pdf',
              storagePath: '/repo/output/data/documents/Fixture Systems.pdf',
              torrentHash: 'abc',
              contentKind: 'pdf',
              contentType: 'application/pdf',
              accessBasis: 'user_owned',
              status: 'queued',
              matchScore: 1,
              availability: {
                seeders: 1,
                peers: 0,
                progress: 0,
                state: 'queuedDL',
              },
              provenance: {
                provider: 'qbittorrent',
                sourceUrl: 'magnet:?xt=urn:btih:abc',
                fetchedAt: '2026-01-01T00:00:00.000Z',
                confidence: 1,
              },
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        }),
      ]),
      inventory: { torrents: [], errors: [] },
      generatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(audit.books[0]?.failureClass).toBe('pdf_unavailable');
    expect(audit.books[0]?.diagnostics).toContain(
      'Project has persisted qBittorrent refs, but the live qBittorrent API returned no matching torrent. Verify the bridge target, qBittorrent profile, and category.',
    );
    expect(audit.errors).toContain(
      'qBittorrent API returned zero torrents while the project has persisted qBittorrent document refs.',
    );
  });

  it('carries OCR sidecar metadata for local PDF audit rows', () => {
    const audit = buildQbittorrentTocCorpusAudit({
      project: project([]),
      localDocuments: [
        {
          path: '/repo/output/data/documents/Fixture Systems.pdf',
          name: 'Fixture Systems.pdf',
          contentType: 'application/pdf',
          bytes: new Uint8Array([37, 80, 68, 70]),
          ocrStatus: {
            ok: true,
            status: 'complete',
            metadata: {
              confidence: 0.82,
              pageRange: { start: 1, end: 8 },
            },
          },
        },
      ],
      generatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(audit.localDocuments[0]).toMatchObject({
      ocrStatus: 'complete',
      ocrConfidence: 0.82,
      ocrPageRange: { start: 1, end: 8 },
    });
  });

  it('separates title-only TOCs from trusted page-range coverage', () => {
    const audit = buildQbittorrentTocCorpusAudit({
      project: project([
        book('titles-only', {
          enrichment: {
            chapters: ['Chapter 1 Signals', 'Chapter 2 Systems'],
            description: '',
            olSubjects: [],
            tocSource: 'pdf',
          },
        }),
        book('trusted-ranges', {
          enrichment: {
            chapters: ['Chapter 1 Signals', 'Chapter 2 Systems'],
            description: '',
            olSubjects: [],
            tocSource: 'pdf',
            chapterPageRanges: [
              { start: 1, end: 40 },
              { start: 41, end: null },
            ],
          },
        }),
      ]),
      generatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(
      audit.books.find((row) => row.bookId === 'titles-only')?.failureClass,
    ).toBe('toc_titles_only');
    expect(
      audit.books.find((row) => row.bookId === 'trusted-ranges')
        ?.trustedChapterPageRangeCount,
    ).toBe(2);
    expect(audit.summary.tocTitlesOnly).toBe(1);
    expect(audit.summary.trustedRangeReady).toBe(1);
  });

  it('scores sparse metadata lower than a book with identifying fields', () => {
    expect(bookMetadataCompleteness(book('full', {
      isbn: '9781111111111',
      publisher: 'Press',
      year: 2020,
      subjects: ['systems'],
      enrichment: {
        chapters: ['Chapter 1 Foundations'],
        description: 'A fixture book.',
        olSubjects: ['systems'],
        tocSource: 'pdf',
      },
    }))).toBeGreaterThan(bookMetadataCompleteness(book('sparse', {
      title: 'Untitled',
      authors: [],
      pages: 1,
    })));
  });
});
