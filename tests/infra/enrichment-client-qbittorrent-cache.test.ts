import { describe, expect, it, vi } from 'vitest';

import {
  createDefaultSourceSettings,
  EXAMPLE_BOOK,
} from '../../src/core/defaults';
import type { Logger } from '../../src/core/types';
import { defaultDocumentAcquisitionPolicy } from '../../src/infra/document-acquisition';
import { createEnrichmentClient } from '../../src/infra/enrichment-client';

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: vi.fn(),
  error: () => undefined,
};

function qbitRef(status: 'queued' | 'complete', fetchedAt: string) {
  return {
    id: status === 'complete' ? 'qbittorrent:fixture:0' : 'qbittorrent:fixture:file',
    provider: 'qbittorrent',
    sourceUrl: 'magnet:?xt=urn:btih:fixture',
    torrentHash: 'fixture',
    fileIndex: status === 'complete' ? 0 : undefined,
    fileName: 'Fixture Book.pdf',
    storagePath: '/tmp/Fixture Book.pdf',
    contentKind: 'pdf' as const,
    contentType: 'application/pdf',
    accessBasis: 'user_provided' as const,
    status,
    matchScore: 0.95,
    availability:
      status === 'complete'
        ? { progress: 1, state: 'stalledUP' }
        : { progress: 0, state: 'metadata_pending' },
    provenance: {
      provider: 'qbittorrent',
      sourceUrl: 'magnet:?xt=urn:btih:fixture',
      fetchedAt,
      confidence: status === 'complete' ? 0.9 : 0.8,
    },
    createdAt: fetchedAt,
    updatedAt: fetchedAt,
  };
}

describe('qBittorrent enrichment cache invalidation', () => {
  it('does not reuse cached bridge document responses while qBittorrent state can change', async () => {
    const sourceSettings = createDefaultSourceSettings();
    sourceSettings.metadataSources.openlibrary = false;
    sourceSettings.metadataSources.googleBooks = false;
    sourceSettings.metadataSources.internetArchive = false;
    sourceSettings.documentSources.directUrl = false;
    sourceSettings.documentSources.internetArchiveText = false;
    sourceSettings.documentSources.qbittorrent = true;
    const acquire = vi
      .fn()
      .mockResolvedValueOnce({
        candidateId: 'candidate',
        provider: 'qbittorrent',
        sourceUrl: 'magnet:?xt=urn:btih:fixture',
        storagePath: '/tmp/Fixture Book.pdf',
        contentType: 'application/pdf',
        accessBasis: 'user_provided' as const,
        confidence: 0.8,
        acquiredAt: '2026-01-05T00:00:00.000Z',
        documentRef: qbitRef('queued', '2026-01-05T00:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        candidateId: 'candidate',
        provider: 'qbittorrent',
        sourceUrl: 'magnet:?xt=urn:btih:fixture',
        storagePath: '/tmp/Fixture Book.pdf',
        contentType: 'application/pdf',
        accessBasis: 'user_provided' as const,
        confidence: 0.9,
        text: 'Contents\nChapter 1 Signals\nChapter 2 Filters\nChapter 3 Systems',
        acquiredAt: '2026-01-05T00:01:00.000Z',
        documentRef: qbitRef('complete', '2026-01-05T00:01:00.000Z'),
      });
    const client = createEnrichmentClient({
      logger: silentLogger,
      documentAcquisitionPolicy: {
        ...defaultDocumentAcquisitionPolicy(),
        enabled: true,
      },
      documentAcquisitionProvider: {
        id: 'mutable-qbit-provider',
        enabled: true,
        findCandidates: vi.fn(async () => [
          {
            id: 'candidate',
            provider: 'qbittorrent',
            title: 'Fixture Book',
            sourceUrl: 'magnet:?xt=urn:btih:fixture',
            contentKind: 'pdf' as const,
            accessBasis: 'user_provided' as const,
            confidence: 0.9,
            matchScore: 0.95,
          },
        ]),
        acquire,
      },
    });
    const request = {
      book: { ...EXAMPLE_BOOK, id: 'book-1', title: 'Fixture Book' },
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
    };

    await client.fetchBook(request);
    const response = await client.fetchBook(request);

    expect(acquire).toHaveBeenCalledTimes(2);
    expect(response.bookPatch.documents?.[0]?.status).toBe('complete');
    expect(response.enrichment.chapters).toEqual(
      expect.arrayContaining([
        'Chapter 1 Signals',
        'Chapter 2 Filters',
        'Chapter 3 Systems',
      ]),
    );
  });
});
