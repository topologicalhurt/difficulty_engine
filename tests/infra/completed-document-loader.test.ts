import { describe, expect, it, vi } from 'vitest';

import { createDefaultSourceSettings, EXAMPLE_BOOK } from '../../src/core/defaults';
import type { Logger } from '../../src/core/types';
import { defaultDocumentAcquisitionPolicy } from '../../src/infra/document-acquisition';
import { createEnrichmentClient } from '../../src/infra/enrichment-client';

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: vi.fn(),
  error: () => undefined,
};

describe('completed document loader', () => {
  it('uses opt-in bridge OCR when completed PDF bytes and embedded text have no TOC', async () => {
    const sourceSettings = createDefaultSourceSettings();
    sourceSettings.metadataSources.openlibrary = false;
    sourceSettings.metadataSources.googleBooks = false;
    sourceSettings.metadataSources.internetArchive = false;
    sourceSettings.documentSources.directUrl = false;
    sourceSettings.documentSources.internetArchiveText = false;
    sourceSettings.documentSources.qbittorrent = true;
    sourceSettings.documentSources.localOcr = true;
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const href = String(url);
      if (href.includes('/documents/read-bytes?')) {
        return new Response('%PDF-1.4\n1 0 obj\n/Width 1041\nstream', {
          status: 200,
          headers: { 'content-type': 'application/pdf' },
        });
      }
      if (href.includes('/documents/extract-text?')) {
        return new Response(
          JSON.stringify({ ok: true, status: 'complete', text: '' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (href.includes('/documents/ocr-toc?')) {
        return new Response(
          JSON.stringify({
            ok: true,
            status: 'complete',
            text: [
              'TABLE OF CONTENTS',
              'Chapter 1 Foundations 1',
              'Chapter 2 Instruments 31',
              'Chapter 3 Repairs 72',
            ].join('\n'),
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
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
            availability: { seeders: 7, peers: 1, progress: 1, state: 'uploading' },
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

    expect(response.enrichment.chapters).toEqual([
      'Chapter 1 Foundations',
      'Chapter 2 Instruments',
      'Chapter 3 Repairs',
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('/documents/ocr-toc?'),
      expect.any(Object),
    );
  });
});
