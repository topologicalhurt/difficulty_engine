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

describe('document acquisition regressions', () => {
  it('keeps one viable metadata-pending qBittorrent ref instead of fanning out', async () => {
    const sourceSettings = createDefaultSourceSettings();
    sourceSettings.metadataSources.openlibrary = false;
    sourceSettings.metadataSources.googleBooks = false;
    sourceSettings.metadataSources.internetArchive = false;
    sourceSettings.documentSources.directUrl = false;
    sourceSettings.documentSources.internetArchiveText = false;
    sourceSettings.documentSources.qbittorrent = true;
    const acquiredAt = '2026-01-05T00:00:00.000Z';
    const acquire = vi.fn(async (candidate: { id: string }) =>
      candidate.id === 'pending'
        ? {
            candidateId: 'pending',
            provider: 'qbittorrent',
            sourceUrl: 'magnet:?xt=urn:btih:pending',
            storagePath: '/tmp/Pending.pdf',
            contentType: 'application/pdf',
            accessBasis: 'user_provided' as const,
            confidence: 0.95,
            acquiredAt,
            documentRef: {
              id: 'qbittorrent:pending:file',
              provider: 'qbittorrent',
              sourceUrl: 'magnet:?xt=urn:btih:pending',
              torrentHash: 'pending',
              fileName: 'Pending.pdf',
              storagePath: '/tmp/Pending.pdf',
              contentKind: 'pdf' as const,
              contentType: 'application/pdf',
              accessBasis: 'user_provided' as const,
              status: 'queued' as const,
              matchScore: 0.95,
              availability: {
                seeders: 12,
                peers: 2,
                progress: 0,
                state: 'metadata_pending',
              },
              provenance: {
                provider: 'qbittorrent',
                sourceUrl: 'magnet:?xt=urn:btih:pending',
                fetchedAt: acquiredAt,
                confidence: 0.95,
              },
              createdAt: acquiredAt,
              updatedAt: acquiredAt,
            },
          }
        : {
            candidateId: 'usable',
            provider: 'qbittorrent',
            sourceUrl: 'magnet:?xt=urn:btih:usable',
            storagePath: '/tmp/Usable.pdf',
            contentType: 'application/pdf',
            accessBasis: 'user_provided' as const,
            confidence: 0.86,
            bytes: new TextEncoder().encode(
              '/Title (Contents) /Title (Chapter 1 Signals) /Title (Chapter 2 Systems)',
            ),
            acquiredAt,
            documentRef: {
              id: 'qbittorrent:usable:0',
              provider: 'qbittorrent',
              sourceUrl: 'magnet:?xt=urn:btih:usable',
              torrentHash: 'usable',
              fileIndex: 0,
              fileName: 'Usable.pdf',
              storagePath: '/tmp/Usable.pdf',
              contentKind: 'pdf' as const,
              contentType: 'application/pdf',
              accessBasis: 'user_provided' as const,
              status: 'complete' as const,
              matchScore: 0.86,
              availability: {
                seeders: 3,
                peers: 1,
                progress: 1,
                state: 'complete',
              },
              provenance: {
                provider: 'qbittorrent',
                sourceUrl: 'magnet:?xt=urn:btih:usable',
                fetchedAt: acquiredAt,
                confidence: 0.86,
              },
              createdAt: acquiredAt,
              updatedAt: acquiredAt,
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
        id: 'metadata-pending-doc-provider',
        enabled: true,
        findCandidates: vi.fn(async () => [
          {
            id: 'pending',
            provider: 'qbittorrent',
            title: 'Usable Book preferred',
            sourceUrl: 'magnet:?xt=urn:btih:pending',
            contentKind: 'pdf' as const,
            accessBasis: 'user_provided' as const,
            confidence: 0.95,
            matchScore: 0.95,
            seeders: 12,
          },
          {
            id: 'usable',
            provider: 'qbittorrent',
            title: 'Usable Book',
            sourceUrl: 'magnet:?xt=urn:btih:usable',
            contentKind: 'pdf' as const,
            accessBasis: 'user_provided' as const,
            confidence: 0.86,
            matchScore: 0.86,
            seeders: 3,
          },
        ]),
        acquire,
      },
    });

    const response = await client.fetchBook({
      book: { ...EXAMPLE_BOOK, id: 'book-1', title: 'Usable Book' },
      sourceSettings,
    });

    expect(acquire).toHaveBeenCalledTimes(1);
    expect(response.bookPatch.selectedDocumentId).toBe(
      'qbittorrent:pending:file',
    );
    expect(response.enrichment.chapters).toEqual([]);
  });

  it('filters rejected zero-availability candidates before acquisition', async () => {
    const sourceSettings = createDefaultSourceSettings();
    sourceSettings.metadataSources.openlibrary = false;
    sourceSettings.metadataSources.googleBooks = false;
    sourceSettings.metadataSources.internetArchive = false;
    sourceSettings.documentSources.directUrl = false;
    sourceSettings.documentSources.internetArchiveText = false;
    sourceSettings.documentSources.qbittorrent = true;
    const acquiredAt = '2026-01-05T00:00:00.000Z';
    const acquire = vi.fn(async (candidate: { id: string }) => {
      if (candidate.id === 'pending') {
        throw new Error('qBittorrent reports no live availability.');
      }
      return {
        candidateId: 'usable',
        provider: 'qbittorrent',
        sourceUrl: 'magnet:?xt=urn:btih:usable',
        storagePath: '/tmp/Usable.pdf',
        contentType: 'application/pdf',
        accessBasis: 'user_provided' as const,
        confidence: 0.86,
        bytes: new TextEncoder().encode(
          '/Title (Contents) /Title (Chapter 1 Signals) /Title (Chapter 2 Systems)',
        ),
        acquiredAt,
        documentRef: {
          id: 'qbittorrent:usable:0',
          provider: 'qbittorrent',
          sourceUrl: 'magnet:?xt=urn:btih:usable',
          torrentHash: 'usable',
          fileIndex: 0,
          fileName: 'Usable.pdf',
          storagePath: '/tmp/Usable.pdf',
          contentKind: 'pdf' as const,
          contentType: 'application/pdf',
          accessBasis: 'user_provided' as const,
          status: 'complete' as const,
          matchScore: 0.86,
          availability: {
            seeders: 3,
            peers: 1,
            progress: 1,
            state: 'complete',
          },
          provenance: {
            provider: 'qbittorrent',
            sourceUrl: 'magnet:?xt=urn:btih:usable',
            fetchedAt: acquiredAt,
            confidence: 0.86,
          },
          createdAt: acquiredAt,
          updatedAt: acquiredAt,
        },
      };
    });
    const client = createEnrichmentClient({
      logger: silentLogger,
      documentAcquisitionPolicy: {
        ...defaultDocumentAcquisitionPolicy(),
        enabled: true,
      },
      documentAcquisitionProvider: {
        id: 'metadata-pending-doc-provider',
        enabled: true,
        findCandidates: vi.fn(async () => [
          {
            id: 'pending',
            provider: 'qbittorrent',
            title: 'Usable Book preferred',
            sourceUrl: 'magnet:?xt=urn:btih:pending',
            contentKind: 'pdf' as const,
            accessBasis: 'user_provided' as const,
            confidence: 0.95,
            matchScore: 0.95,
            seeders: 0,
          },
          {
            id: 'usable',
            provider: 'qbittorrent',
            title: 'Usable Book',
            sourceUrl: 'magnet:?xt=urn:btih:usable',
            contentKind: 'pdf' as const,
            accessBasis: 'user_provided' as const,
            confidence: 0.86,
            matchScore: 0.86,
            seeders: 3,
          },
        ]),
        acquire,
      },
    });

    const response = await client.fetchBook({
      book: { ...EXAMPLE_BOOK, id: 'book-1', title: 'Usable Book' },
      sourceSettings,
    });

    expect(acquire).toHaveBeenCalledTimes(1);
    expect(response.bookPatch.selectedDocumentId).toBe('qbittorrent:usable:0');
    expect(response.enrichment.chapters).toEqual([
      'Chapter 1 Signals',
      'Chapter 2 Systems',
    ]);
  });
});
