import { describe, expect, it } from 'vitest';

import { EXAMPLE_BOOK, createDefaultSourceSettings } from '../../src/core/defaults';
import {
  defaultDocumentAcquisitionPolicy,
  rankDocumentCandidates,
} from '../../src/infra/document-acquisition';
import {
  candidateFromLiveTorrent,
  liveTorrentStatus,
  normalizeLiveTorrent,
} from '../../src/infra/qbittorrent-live-inventory';

describe('qBittorrent live inventory', () => {
  it('normalizes torrent state and PDF eligibility without mutating qBittorrent', () => {
    const live = normalizeLiveTorrent(
      {
        hash: 'ABC123',
        name: 'Fixture Book A Author',
        state: 'metaDL',
        progress: 0,
        num_seeds: 10,
      },
      [
        { index: 0, name: 'Fixture Book A Author.pdf', progress: 0.1 },
        { index: 1, name: 'Fixture Book/extras/notes.pdf', progress: 0 },
        { index: 2, name: 'Fixture Book.txt', progress: 0 },
      ],
    );

    expect(live.hash).toBe('abc123');
    expect(live.staleStatus).toBe('metadata_pending');
    expect(live.eligiblePdfCount).toBe(1);
    expect(live.files.map((file) => file.pdfEligible)).toEqual([
      true,
      false,
      false,
    ]);
  });

  it('keeps user-paused torrents out of stalled replacement status', () => {
    expect(liveTorrentStatus({ state: 'pausedDL', progress: 0 })).toBe(
      'paused',
    );
    expect(liveTorrentStatus({ state: 'stalledDL', progress: 0 })).toBe(
      'stalled',
    );
  });

  it('converts a matching live torrent into a ranked user-owned candidate', () => {
    const sourceSettings = createDefaultSourceSettings();
    const policy = {
      ...defaultDocumentAcquisitionPolicy(),
      enabled: true,
      sourceSettings,
    };
    const live = normalizeLiveTorrent(
      {
        hash: 'hash1',
        name: 'Fixture Systems A Author',
        state: 'downloading',
        progress: 0.3,
        num_seeds: 15,
        num_leechs: 2,
      },
      [{ index: 0, name: 'Fixture Systems A Author.pdf', progress: 0.3 }],
    );

    const candidate = candidateFromLiveTorrent(live, {
      book: {
        ...EXAMPLE_BOOK,
        title: 'Fixture Systems',
        authors: ['A Author'],
        sourcePath: null,
      },
      policy,
    });

    expect(candidate?.accessBasis).toBe('user_owned');
    expect(candidate?.sourceUrl).toBe('magnet:?xt=urn:btih:hash1');
    expect(rankDocumentCandidates(candidate ? [candidate] : [], policy)).toHaveLength(1);
  });
});
