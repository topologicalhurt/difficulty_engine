import { describe, expect, it } from 'vitest';

import type { BookDocumentRef, SourceContentKind } from '../../src/core/types';
import {
  mergeDocumentCandidateQueue,
  observeDocumentGreylist,
} from '../../src/core/document-acquisition-state';
import {
  chooseSelectedDocumentId,
  choosePreferredDocumentCandidate,
  defaultDocumentAcquisitionPolicy,
  isLawfulDocumentCandidate,
  mergeDocumentRefs,
} from '../../src/infra/document-acquisition';

describe('document acquisition policy', () => {
  function documentRef(
    id: string,
    patch: Partial<BookDocumentRef> = {},
  ): BookDocumentRef {
    return {
      id,
      provider: 'fixture',
      fileName: `${id}.pdf`,
      storagePath: `/tmp/${id}.pdf`,
      contentKind: 'pdf',
      contentType: 'application/pdf',
      accessBasis: 'open_access',
      status: 'complete',
      matchScore: 0.5,
      availability: {
        seeders: null,
        peers: null,
        progress: 1,
        state: 'complete',
      },
      provenance: {
        provider: 'fixture',
        fetchedAt: '2026-01-05T00:00:00.000Z',
        confidence: 0.5,
      },
      createdAt: '2026-01-05T00:00:00.000Z',
      updatedAt: '2026-01-05T00:00:00.000Z',
      ...patch,
    };
  }

  it('is disabled by default and rejects unknown legal basis', () => {
    const policy = defaultDocumentAcquisitionPolicy();
    const candidate = {
      id: 'candidate-1',
      provider: 'fixture',
      title: 'Fixture',
      sourceUrl: 'magnet:?xt=urn:btih:test',
      contentKind: 'pdf' as const,
      confidence: 0.8,
    };

    expect(policy.enabled).toBe(false);
    expect(isLawfulDocumentCandidate(candidate, policy)).toBe(false);
    expect(choosePreferredDocumentCandidate([candidate], policy)).toBeNull();
  });

  it('prefers text before epub, OCR text, and pdf among lawful candidates', () => {
    const policy = { ...defaultDocumentAcquisitionPolicy(), enabled: true };
    const selected = choosePreferredDocumentCandidate(
      [
        {
          id: 'pdf',
          provider: 'fixture',
          title: 'PDF',
          sourceUrl: 'https://example.test/book.pdf',
          contentKind: 'pdf',
          accessBasis: 'open_access',
          confidence: 0.99,
        },
        {
          id: 'ocr',
          provider: 'fixture',
          title: 'OCR',
          sourceUrl: 'https://example.test/book_djvu.txt',
          contentKind: 'ocr_text',
          accessBasis: 'open_access',
          confidence: 0.95,
        },
        {
          id: 'epub',
          provider: 'fixture',
          title: 'EPUB',
          sourceUrl: 'https://example.test/book.epub',
          contentKind: 'epub',
          accessBasis: 'open_access',
          confidence: 0.92,
        },
        {
          id: 'txt',
          provider: 'fixture',
          title: 'Text',
          sourceUrl: 'https://example.test/book.txt',
          contentKind: 'text',
          accessBasis: 'open_access',
          confidence: 0.7,
        },
      ],
      policy,
    );

    expect(selected?.id).toBe('txt');
  });

  it('uses one shared content-preference order for candidate ranking', () => {
    const policy = {
      ...defaultDocumentAcquisitionPolicy(),
      enabled: true,
      contentPreference: [
        'epub',
        'text',
        'ocr_text',
        'pdf',
      ] as SourceContentKind[],
    };
    const selected = choosePreferredDocumentCandidate(
      [
        {
          id: 'txt',
          provider: 'fixture',
          title: 'Text',
          sourceUrl: 'https://example.test/book.txt',
          contentKind: 'text',
          accessBasis: 'open_access',
          confidence: 0.9,
        },
        {
          id: 'epub',
          provider: 'fixture',
          title: 'EPUB',
          sourceUrl: 'https://example.test/book.epub',
          contentKind: 'epub',
          accessBasis: 'open_access',
          confidence: 0.9,
        },
      ],
      policy,
    );

    expect(selected?.id).toBe('epub');
  });

  it('uses live availability to prefer viable exact matches over stalled ones', () => {
    const policy = { ...defaultDocumentAcquisitionPolicy(), enabled: true };
    const selected = choosePreferredDocumentCandidate(
      [
        {
          id: 'stalled',
          provider: 'qbittorrent',
          title: 'Fixture Book Author',
          sourceUrl: 'magnet:?xt=urn:btih:stalled',
          contentKind: 'pdf',
          accessBasis: 'open_access',
          confidence: 0.9,
          matchScore: 0.96,
          seeders: 0,
          availability: {
            seeders: 0,
            peers: 0,
            progress: 0.05,
            state: 'stalledDL',
            availability: 0,
            etaSeconds: null,
            downloadSpeedBytesPerSecond: 0,
          },
        },
        {
          id: 'viable',
          provider: 'qbittorrent',
          title: 'Fixture Book Author',
          sourceUrl: 'magnet:?xt=urn:btih:viable',
          contentKind: 'pdf',
          accessBasis: 'open_access',
          confidence: 0.9,
          matchScore: 0.94,
          seeders: 18,
          availability: {
            seeders: 18,
            peers: 1,
            progress: 0.1,
            state: 'downloading',
            availability: 1,
            etaSeconds: 600,
            downloadSpeedBytesPerSecond: 900_000,
          },
        },
      ],
      policy,
    );

    expect(selected?.id).toBe('viable');
  });

  it('demotes greylisted candidates without blocking manual retry', () => {
    const policy = { ...defaultDocumentAcquisitionPolicy(), enabled: true };
    const state = mergeDocumentCandidateQueue(
      observeDocumentGreylist(
        undefined,
        [
          documentRef('stalled-doc', {
            provider: 'qbittorrent',
            sourceUrl: 'magnet:?xt=urn:btih:stalled',
            torrentHash: 'stalled',
            status: 'stalled',
            availability: {
              seeders: 0,
              peers: 0,
              progress: 0.1,
              state: 'stalledDL',
              availability: 0,
              downloadSpeedBytesPerSecond: 0,
            },
          }),
        ],
        '2026-01-05T00:00:00.000Z',
      ),
      [
        {
          id: 'stalled',
          provider: 'qbittorrent',
          title: 'Fixture Book Author',
          sourceUrl: 'magnet:?xt=urn:btih:stalled',
          contentKind: 'pdf',
          accessBasis: 'open_access',
          confidence: 0.95,
          matchScore: 0.97,
          seeders: 0,
          availability: {
            seeders: 0,
            peers: 0,
            progress: 0.1,
            state: 'stalledDL',
            availability: 0,
            downloadSpeedBytesPerSecond: 0,
          },
        },
        {
          id: 'viable',
          provider: 'qbittorrent',
          title: 'Fixture Book Author',
          sourceUrl: 'magnet:?xt=urn:btih:viable',
          contentKind: 'pdf',
          accessBasis: 'open_access',
          confidence: 0.9,
          matchScore: 0.94,
          seeders: 8,
          availability: {
            seeders: 8,
            peers: 1,
            progress: 0,
            state: 'search-result',
            availability: 1,
          },
        },
      ],
      '2026-01-05T00:01:00.000Z',
    );
    const selected = choosePreferredDocumentCandidate(
      state.candidateQueue,
      policy,
      state,
    );

    expect(state.candidateQueue.map((candidate) => candidate.id)).toEqual([
      'viable',
      'stalled',
    ]);
    expect(state.candidateQueue[1]?.retryable).toBe(true);
    expect(selected?.id).toBe('viable');
  });

  it('decays greylist penalties after clean observations', () => {
    const first = observeDocumentGreylist(
      undefined,
      [
        documentRef('stalled-doc', {
          provider: 'qbittorrent',
          sourceUrl: 'magnet:?xt=urn:btih:decay',
          torrentHash: 'decay',
          status: 'stalled',
          availability: {
            seeders: 0,
            peers: 0,
            progress: 0.2,
            state: 'stalledDL',
            availability: 0,
          },
        }),
      ],
      '2026-01-05T00:00:00.000Z',
    );
    const second = mergeDocumentCandidateQueue(
      first,
      [
        {
          id: 'clean',
          provider: 'qbittorrent',
          title: 'Fixture Book Author',
          sourceUrl: 'magnet:?xt=urn:btih:decay',
          contentKind: 'pdf',
          accessBasis: 'open_access',
          confidence: 0.9,
          matchScore: 0.95,
          seeders: 10,
          availability: {
            seeders: 10,
            peers: 1,
            progress: 0.2,
            state: 'downloading',
            availability: 1,
            downloadSpeedBytesPerSecond: 1000,
          },
        },
      ],
      '2026-01-05T00:01:00.000Z',
    );

    expect(second.greylist['hash:decay']?.penalty).toBeLessThan(
      first.greylist['hash:decay']?.penalty ?? 0,
    );
  });


  it('selects the best completed document instead of alphabetical order', () => {
    const selected = chooseSelectedDocumentId(
      [
        documentRef('a-weak', {
          fileName: 'A weak match.pdf',
          matchScore: 0.2,
          availability: {
            seeders: 20,
            peers: null,
            progress: 1,
            state: 'complete',
          },
        }),
        documentRef('z-strong', {
          fileName: 'Z exact match.pdf',
          matchScore: 0.95,
          availability: {
            seeders: 3,
            peers: null,
            progress: 1,
            state: 'complete',
          },
        }),
      ],
      null,
    );

    expect(selected).toBe('z-strong');
  });

  it('does not let content preference beat a clearly stronger match', () => {
    const selected = chooseSelectedDocumentId(
      [
        documentRef('weak-text', {
          fileName: 'Unrelated notes.txt',
          contentKind: 'text',
          contentType: 'text/plain',
          matchScore: 0.2,
        }),
        documentRef('strong-pdf', {
          fileName: 'Exact book match.pdf',
          contentKind: 'pdf',
          contentType: 'application/pdf',
          matchScore: 0.95,
        }),
      ],
      null,
    );

    expect(selected).toBe('strong-pdf');
  });

  it('preserves an existing selected document when it still exists', () => {
    const selected = chooseSelectedDocumentId(
      [
        documentRef('preferred', { matchScore: 0.95 }),
        documentRef('current', { matchScore: 0.2 }),
      ],
      'current',
    );

    expect(selected).toBe('current');
  });

  it('collapses duplicate qBittorrent refs and keeps the best status', () => {
    const merged = mergeDocumentRefs(
      [
        documentRef('old-stalled', {
          provider: 'qbittorrent',
          torrentHash: 'ABC123',
          fileIndex: 0,
          status: 'stalled',
          storagePath: '/tmp/Book.pdf',
          matchScore: 0.9,
          availability: {
            seeders: 0,
            peers: 0,
            progress: 0.4,
            state: 'stalledDL',
          },
        }),
      ],
      [
        documentRef('new-complete', {
          provider: 'qbittorrent',
          torrentHash: 'abc123',
          fileIndex: 0,
          status: 'complete',
          storagePath: '/repo/output/data/documents/Book.pdf',
          matchScore: 0.95,
          availability: {
            seeders: 4,
            peers: 0,
            progress: 1,
            state: 'stalledUP',
          },
        }),
      ],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe('new-complete');
    expect(merged[0]?.status).toBe('complete');
    expect(merged[0]?.storagePath).toBe('/repo/output/data/documents/Book.pdf');
  });

  it('canonicalizes old qBittorrent downloads to one best ref per book', () => {
    const merged = mergeDocumentRefs(
      [
        documentRef('old-stalled', {
          provider: 'qbittorrent',
          torrentHash: 'old',
          status: 'stalled',
          matchScore: 0.9,
          availability: {
            seeders: 0,
            peers: 0,
            progress: 0.2,
            state: 'stalledDL',
          },
        }),
        documentRef('new-downloading', {
          provider: 'qbittorrent',
          torrentHash: 'new',
          status: 'downloading',
          matchScore: 0.95,
          availability: {
            seeders: 12,
            peers: 1,
            progress: 0.6,
            state: 'downloading',
          },
        }),
      ],
      [],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe('new-downloading');
  });
});
