import { describe, expect, it, vi } from 'vitest';

import {
  createDefaultSourceSettings,
  EXAMPLE_BOOK,
} from '../../src/core/defaults';
import type { Logger } from '../../src/core/types';
import { defaultDocumentAcquisitionPolicy } from '../../src/infra/document-acquisition';
import { stableEnrichmentCacheKey } from '../../src/infra/enrichment-cache-key';
import { createEnrichmentClient } from '../../src/infra/enrichment-client';
import { searchRequestKey } from '../../src/infra/enrichment-search';

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: vi.fn(),
  error: () => undefined,
};

describe('enrichment client degradation', () => {
  it('varies enrichment cache keys for source policy and local document connection changes', () => {
    const book = {
      ...EXAMPLE_BOOK,
      id: 'book-1',
      title: 'Cache Sensitive Book',
    };
    const sourceSettings = createDefaultSourceSettings();
    const baseKey = stableEnrichmentCacheKey({ book, sourceSettings });
    const contentPreferenceKey = stableEnrichmentCacheKey({
      book,
      sourceSettings: {
        ...sourceSettings,
        contentPreference: ['pdf', 'text', 'epub', 'ocr_text'],
      },
    });
    const pluginKey = stableEnrichmentCacheKey({
      book,
      sourceSettings: {
        ...sourceSettings,
        qbittorrent: {
          ...sourceSettings.qbittorrent,
          allowedPlugins: ['internetarchive'],
        },
      },
    });
    const connectionKey = stableEnrichmentCacheKey({
      book,
      sourceSettings,
      qbittorrentConnection: {
        enabled: true,
        baseUrl: 'http://127.0.0.1:8787',
        username: '',
        password: 'not-part-of-cache-key',
        savePath: 'output/data/documents',
        category: 'difficulty-engine',
        timeoutMs: 10000,
      },
    });

    expect(
      new Set([baseKey, contentPreferenceKey, pluginKey, connectionKey]).size,
    ).toBe(4);
    expect(connectionKey).not.toContain('not-part-of-cache-key');
  });

  it('varies search in-flight keys when Open Library is disabled', () => {
    const enabled = createDefaultSourceSettings();
    const disabled = createDefaultSourceSettings();
    disabled.metadataSources.openlibrary = false;

    expect(
      searchRequestKey({ query: 'algebra', sourceSettings: enabled }),
    ).not.toBe(
      searchRequestKey({ query: 'algebra', sourceSettings: disabled }),
    );
  });

  it('does not fail metadata enrichment when document acquisition fails', async () => {
    const sourceSettings = createDefaultSourceSettings();
    sourceSettings.metadataSources.openlibrary = false;
    sourceSettings.metadataSources.googleBooks = false;
    sourceSettings.metadataSources.internetArchive = false;
    sourceSettings.documentSources.directUrl = false;
    sourceSettings.documentSources.internetArchiveText = false;
    sourceSettings.documentSources.qbittorrent = true;
    const client = createEnrichmentClient({
      logger: silentLogger,
      documentAcquisitionPolicy: {
        ...defaultDocumentAcquisitionPolicy(),
        enabled: true,
      },
      documentAcquisitionProvider: {
        id: 'failing-doc-provider',
        enabled: true,
        findCandidates: vi.fn(async () => {
          throw new Error('document provider unavailable');
        }),
        acquire: vi.fn(),
      },
    });
    const book = {
      ...EXAMPLE_BOOK,
      id: 'book-1',
      title: 'Local Data Book',
      subjects: ['local subject'],
      enrichment: {
        ...EXAMPLE_BOOK.enrichment,
        description: 'Local description survives document provider failure.',
        olSubjects: ['local subject'],
      },
    };

    const response = await client.fetchBook({ book, sourceSettings });

    expect(response.enrichment.description).toContain('Local description');
    expect(response.provenance[0]?.provider).toBe('manual');
  });

  it('tries lower-ranked document candidates when the preferred acquisition fails', async () => {
    const sourceSettings = createDefaultSourceSettings();
    sourceSettings.metadataSources.openlibrary = false;
    sourceSettings.metadataSources.googleBooks = false;
    sourceSettings.metadataSources.internetArchive = false;
    sourceSettings.documentSources.directUrl = false;
    sourceSettings.documentSources.internetArchiveText = false;
    sourceSettings.documentSources.qbittorrent = true;
    const acquire = vi.fn(async (candidate: { id: string }) =>
      candidate.id === 'preferred'
        ? null
        : {
            candidateId: 'fallback',
            provider: 'qbittorrent',
            sourceUrl: 'magnet:?xt=urn:btih:fallback',
            storagePath: '/tmp/Fallback Book.txt',
            contentType: 'text/plain',
            accessBasis: 'user_provided' as const,
            confidence: 0.8,
            text: 'Contents\nChapter 1 Signals\nChapter 2 Systems',
            acquiredAt: '2026-01-05T00:00:00.000Z',
            documentRef: {
              id: 'qbittorrent:fallback:0',
              provider: 'qbittorrent',
              sourceUrl: 'magnet:?xt=urn:btih:fallback',
              torrentHash: 'fallback',
              fileIndex: 0,
              fileName: 'Fallback Book.txt',
              storagePath: '/tmp/Fallback Book.txt',
              contentKind: 'text' as const,
              contentType: 'text/plain',
              accessBasis: 'user_provided' as const,
              status: 'complete' as const,
              matchScore: 0.86,
              availability: {
                seeders: 4,
                peers: 1,
                progress: 1,
                state: 'complete',
              },
              provenance: {
                provider: 'qbittorrent',
                sourceUrl: 'magnet:?xt=urn:btih:fallback',
                fetchedAt: '2026-01-05T00:00:00.000Z',
                confidence: 0.8,
              },
              createdAt: '2026-01-05T00:00:00.000Z',
              updatedAt: '2026-01-05T00:00:00.000Z',
            },
          },
    );
    const client = createEnrichmentClient({
      logger: silentLogger,
      documentAcquisitionPolicy: {
        ...defaultDocumentAcquisitionPolicy(),
        enabled: true,
      },
      documentAcquisitionProvider: {
        id: 'fallback-doc-provider',
        enabled: true,
        findCandidates: vi.fn(async () => [
          {
            id: 'preferred',
            provider: 'qbittorrent',
            title: 'Fallback Book preferred',
            sourceUrl: 'magnet:?xt=urn:btih:preferred',
            contentKind: 'text' as const,
            accessBasis: 'user_provided' as const,
            confidence: 0.95,
            matchScore: 0.95,
            seeders: 8,
          },
          {
            id: 'fallback',
            provider: 'qbittorrent',
            title: 'Fallback Book',
            sourceUrl: 'magnet:?xt=urn:btih:fallback',
            contentKind: 'text' as const,
            accessBasis: 'user_provided' as const,
            confidence: 0.8,
            matchScore: 0.86,
            seeders: 4,
          },
        ]),
        acquire,
      },
    });

    const response = await client.fetchBook({
      book: { ...EXAMPLE_BOOK, id: 'book-1', title: 'Fallback Book' },
      sourceSettings,
    });

    expect(acquire).toHaveBeenCalledTimes(2);
    expect(response.bookPatch.selectedDocumentId).toBe(
      'qbittorrent:fallback:0',
    );
    expect(response.enrichment.chapters).toEqual(
      expect.arrayContaining(['Chapter 1 Signals', 'Chapter 2 Systems']),
    );
  });

  it('merges completed acquired document refs and uses readable text for TOC extraction', async () => {
    const sourceSettings = createDefaultSourceSettings();
    sourceSettings.metadataSources.openlibrary = false;
    sourceSettings.metadataSources.googleBooks = false;
    sourceSettings.metadataSources.internetArchive = false;
    sourceSettings.documentSources.directUrl = false;
    sourceSettings.documentSources.internetArchiveText = false;
    sourceSettings.documentSources.qbittorrent = true;
    const client = createEnrichmentClient({
      logger: silentLogger,
      documentAcquisitionPolicy: {
        ...defaultDocumentAcquisitionPolicy(),
        enabled: true,
      },
      documentAcquisitionProvider: {
        id: 'fixture-doc-provider',
        enabled: true,
        findCandidates: vi.fn(async () => [
          {
            id: 'candidate',
            provider: 'qbittorrent',
            title: 'Readable Book',
            sourceUrl: 'magnet:?xt=urn:btih:fixture',
            contentKind: 'text' as const,
            accessBasis: 'user_provided' as const,
            confidence: 0.9,
          },
        ]),
        acquire: vi.fn(async () => ({
          candidateId: 'candidate',
          provider: 'qbittorrent',
          sourceUrl: 'magnet:?xt=urn:btih:fixture',
          storagePath: '/tmp/Readable Book.txt',
          contentType: 'text/plain',
          accessBasis: 'user_provided' as const,
          confidence: 0.9,
          text: 'Contents\nChapter 1 Foundations\nChapter 2 Methods\nChapter 3 Applications',
          acquiredAt: '2026-01-05T00:00:00.000Z',
          documentRef: {
            id: 'qbittorrent:fixture:1',
            provider: 'qbittorrent',
            sourceUrl: 'magnet:?xt=urn:btih:fixture',
            torrentHash: 'fixture',
            fileIndex: 1,
            fileName: 'Readable Book.txt',
            storagePath: '/tmp/Readable Book.txt',
            contentKind: 'text' as const,
            contentType: 'text/plain',
            accessBasis: 'user_provided' as const,
            status: 'complete' as const,
            matchScore: 0.95,
            availability: {
              seeders: 4,
              peers: 1,
              progress: 1,
              state: 'uploading',
            },
            provenance: {
              provider: 'qbittorrent',
              sourceUrl: 'magnet:?xt=urn:btih:fixture',
              fetchedAt: '2026-01-05T00:00:00.000Z',
              confidence: 0.9,
            },
            createdAt: '2026-01-05T00:00:00.000Z',
            updatedAt: '2026-01-05T00:00:00.000Z',
          },
        })),
      },
    });

    const response = await client.fetchBook({
      book: {
        ...EXAMPLE_BOOK,
        id: 'book-1',
        title: 'Readable Book',
        selectedDocumentId: 'missing-doc',
      },
      sourceSettings,
    });

    expect(response.bookPatch.documents).toHaveLength(1);
    expect(response.bookPatch.selectedDocumentId).toBe('qbittorrent:fixture:1');
    expect(response.enrichment.chapters).toEqual(
      expect.arrayContaining([
        'Chapter 1 Foundations',
        'Chapter 2 Methods',
        'Chapter 3 Applications',
      ]),
    );
    expect(response.enrichment.provenance?.chapters?.provider).toBe(
      'qbittorrent',
    );
  });

  it('reuses completed project document refs for TOC extraction on later refreshes', async () => {
    const sourceSettings = createDefaultSourceSettings();
    sourceSettings.metadataSources.openlibrary = false;
    sourceSettings.metadataSources.googleBooks = false;
    sourceSettings.metadataSources.internetArchive = false;
    sourceSettings.documentSources.directUrl = false;
    sourceSettings.documentSources.internetArchiveText = false;
    sourceSettings.documentSources.qbittorrent = true;
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const href = String(url);
      if (href.includes('/documents/read-bytes?')) {
        return new Response('%PDF-1.4\n1 0 obj\n/Title (Front Matter)', {
          status: 200,
          headers: { 'content-type': 'application/pdf' },
        });
      }
      if (href.includes('/documents/extract-text?')) {
        return new Response(
          JSON.stringify({
            ok: true,
            status: 'complete',
            text: [
              'CONTENTS',
              'CHAPTER 1 Introduction to Electronics 1',
              'CHAPTER 2 Theory 5',
              'CHAPTER 3 Basic Electronic Circuit Components 253',
            ].join('\n'),
          }),
          { status: 200, headers: { 'content-type': 'text/plain' } },
        );
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
    const client = createEnrichmentClient({
      fetchImpl,
      logger: silentLogger,
      documentAcquisitionPolicy: {
        ...defaultDocumentAcquisitionPolicy(),
        enabled: false,
      },
    });
    await client.fetchBook({
      book: {
        ...EXAMPLE_BOOK,
        id: 'practical-electronics',
        title: 'Practical Electronics for Inventors',
      },
      sourceSettings,
      qbittorrentConnection: {
        enabled: true,
        baseUrl: 'http://127.0.0.1:8787',
        username: '',
        password: '',
        savePath: 'output/data/documents',
        category: 'difficulty-engine',
        timeoutMs: 10000,
      },
    });
    const response = await client.fetchBook({
      book: {
        ...EXAMPLE_BOOK,
        id: 'practical-electronics',
        title: 'Practical Electronics for Inventors',
        documents: [
          {
            id: 'qbittorrent:complete:0',
            provider: 'qbittorrent',
            sourceUrl: 'magnet:?xt=urn:btih:complete',
            torrentHash: 'complete',
            fileIndex: 0,
            fileName: 'Practical Electronics for Inventors.pdf',
            storagePath:
              'output/data/documents/Practical Electronics for Inventors.pdf',
            contentKind: 'pdf',
            contentType: 'application/pdf',
            accessBasis: 'user_provided',
            status: 'complete',
            matchScore: 0.95,
            availability: {
              seeders: 7,
              peers: 1,
              progress: 1,
              state: 'uploading',
            },
            provenance: {
              provider: 'qbittorrent',
              sourceUrl: 'magnet:?xt=urn:btih:complete',
              fetchedAt: '2026-01-05T00:00:00.000Z',
              confidence: 0.9,
            },
            createdAt: '2026-01-05T00:00:00.000Z',
            updatedAt: '2026-01-05T00:00:00.000Z',
          },
        ],
      },
      sourceSettings,
      qbittorrentConnection: {
        enabled: true,
        baseUrl: 'http://127.0.0.1:8787',
        username: '',
        password: '',
        savePath: 'output/data/documents',
        category: 'difficulty-engine',
        timeoutMs: 10000,
      },
    });

    expect(response.enrichment.chapters).toEqual(
      expect.arrayContaining([
        'CHAPTER 1 Introduction to Electronics',
        'CHAPTER 2 Theory',
        'CHAPTER 3 Basic Electronic Circuit Components',
      ]),
    );
    expect(response.enrichment.provenance?.chapters?.provider).toBe(
      'qbittorrent',
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('/documents/extract-text?'),
      expect.any(Object),
    );
  });

});
