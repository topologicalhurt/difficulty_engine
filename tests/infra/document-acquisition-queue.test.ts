import { describe, expect, it } from 'vitest';

import {
  mergeDocumentCandidateQueue,
  observeDocumentGreylist,
} from '../../src/core/document-acquisition-state';
import { normalizeBookDocumentAcquisition } from '../../src/core/project-normalize-documents';
import type { BookDocumentRef } from '../../src/core/types';
import {
  choosePreferredDocumentCandidate,
  defaultDocumentAcquisitionPolicy,
} from '../../src/infra/document-acquisition';

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

describe('document acquisition queue', () => {
  it('demotes greylisted candidates and keeps the best duplicate title', () => {
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
    ]);
    expect(state.candidateQueue[0]?.retryable).toBe(true);
    expect(selected?.id).toBe('viable');
  });

  it('deduplicates stale persisted queue rows by presentation title', () => {
    const staleQueue = mergeDocumentCandidateQueue(
      undefined,
      [
        {
          id: 'stale-low',
          provider: 'qbittorrent',
          title: 'Fourier Analysis An Introduction Stein Shakarchi PDF',
          sourceUrl: 'magnet:?xt=urn:btih:stale',
          contentKind: 'pdf',
          accessBasis: 'open_access',
          confidence: 0.7,
          matchScore: 0.8,
          seeders: 1,
          qualityScore: 0.4,
        },
      ],
      '2026-01-05T00:00:00.000Z',
    );
    const refreshed = mergeDocumentCandidateQueue(
      staleQueue,
      [
        {
          id: 'fresh-best',
          provider: 'qbittorrent',
          title: 'Fourier Analysis An Introduction Stein Shakarchi 2011',
          sourceUrl: 'magnet:?xt=urn:btih:fresh',
          contentKind: 'pdf',
          accessBasis: 'open_access',
          confidence: 0.9,
          matchScore: 0.95,
          seeders: 12,
          qualityScore: 0.86,
        },
      ],
      '2026-01-05T00:01:00.000Z',
    );

    expect(refreshed.candidateQueue.map((candidate) => candidate.id)).toEqual([
      'fresh-best',
    ]);
  });

  it('normalizes persisted duplicate queue rows through the same ranking path', () => {
    const normalized = normalizeBookDocumentAcquisition({
      candidateQueue: [
        {
          id: 'stale-low',
          provider: 'qbittorrent',
          title: 'Stein E Lectures in Analysis Vol 2 Complex Analysis 2003',
          sourceUrl: 'magnet:?xt=urn:btih:stale',
          contentKind: 'pdf',
          accessBasis: 'open_access',
          confidence: 0.7,
          matchScore: 0.8,
          seeders: 1,
          qualityScore: 0.4,
        },
        {
          id: 'fresh-best',
          provider: 'qbittorrent',
          title: 'Stein E. Lectures in Analysis. Vol 2. Complex Analysis 2003',
          sourceUrl: 'magnet:?xt=urn:btih:fresh',
          contentKind: 'pdf',
          accessBasis: 'open_access',
          confidence: 0.9,
          matchScore: 0.95,
          seeders: 12,
          qualityScore: 0.86,
        },
      ],
    });

    expect(normalized.candidateQueue.map((candidate) => candidate.id)).toEqual([
      'fresh-best',
    ]);
  });

  it('decays greylist penalties after clean observations', () => {
    const stalledRef = documentRef('stalled-doc', {
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
    });
    const observedOnce = observeDocumentGreylist(
      undefined,
      [stalledRef],
      '2026-01-05T00:00:00.000Z',
    );
    const first = observeDocumentGreylist(
      observedOnce,
      [stalledRef],
      '2026-01-05T00:00:30.000Z',
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

  it('records repeated stalled local candidate observations before penalizing', () => {
    const stalledCandidate = {
      id: 'local-stalled',
      provider: 'qbittorrent',
      title: 'Fixture Book Author',
      sourceUrl: 'magnet:?xt=urn:btih:localstalled',
      contentKind: 'pdf' as const,
      accessBasis: 'user_owned' as const,
      confidence: 0.9,
      matchScore: 0.95,
      seeders: 0,
      qualityScore: 0.7,
      availability: {
        seeders: 0,
        peers: 0,
        progress: 0.15,
        state: 'stalledDL',
        availability: 0,
        downloadSpeedBytesPerSecond: 0,
      },
    };
    const first = mergeDocumentCandidateQueue(
      undefined,
      [stalledCandidate],
      '2026-01-05T00:00:00.000Z',
    );
    const second = mergeDocumentCandidateQueue(
      first,
      [stalledCandidate],
      '2026-01-05T00:01:00.000Z',
    );

    expect(first.greylist['hash:localstalled']?.observations).toBe(1);
    expect(first.greylist['hash:localstalled']?.penalty).toBe(0);
    expect(second.greylist['hash:localstalled']?.observations).toBe(2);
    expect(second.greylist['hash:localstalled']?.penalty).toBeGreaterThan(0);
    expect(second.candidateQueue[0]?.greylistPenalty).toBeGreaterThan(0);
  });

  it('uses fresh live candidate state over stale queued state for the same hash', () => {
    const clean = {
      id: 'local-clean',
      provider: 'qbittorrent',
      title: 'Fixture Book Author',
      sourceUrl: 'magnet:?xt=urn:btih:freshstate',
      contentKind: 'pdf' as const,
      accessBasis: 'user_owned' as const,
      confidence: 0.9,
      matchScore: 0.95,
      seeders: 9,
      qualityScore: 0.9,
      availability: {
        seeders: 9,
        peers: 1,
        progress: 0.45,
        state: 'downloading',
        availability: 1,
        downloadSpeedBytesPerSecond: 1000,
      },
    };
    const stale = {
      ...clean,
      id: 'local-stalled',
      seeders: 0,
      availability: {
        seeders: 0,
        peers: 0,
        progress: 0.45,
        state: 'stalledDL',
        availability: 0,
        downloadSpeedBytesPerSecond: 0,
      },
    };
    const queued = mergeDocumentCandidateQueue(
      undefined,
      [clean],
      '2026-01-05T00:00:00.000Z',
    );
    const refreshed = mergeDocumentCandidateQueue(
      queued,
      [stale],
      '2026-01-05T00:01:00.000Z',
    );

    expect(refreshed.candidateQueue[0]?.id).toBe('local-stalled');
    expect(refreshed.candidateQueue[0]?.availability?.state).toBe('stalledDL');
  });
});
