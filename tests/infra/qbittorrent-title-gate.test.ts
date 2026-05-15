import { describe, expect, it } from 'vitest';

import {
  createDefaultSourceSettings,
  EXAMPLE_BOOK,
} from '../../src/core/defaults';
import { defaultDocumentAcquisitionPolicy } from '../../src/infra/document-acquisition';
import { candidateFromLiveTorrent } from '../../src/infra/qbittorrent-live-inventory';
import { classifySearchResults } from '../../src/infra/qbittorrent-search';

function requestFor(title: string) {
  const sourceSettings = createDefaultSourceSettings();
  sourceSettings.documentSources.qbittorrent = true;
  sourceSettings.qbittorrent.searchPlugins = true;
  sourceSettings.qbittorrent.allowedPlugins = ['limetorrents'];
  sourceSettings.qbittorrent.allowedSites = [];
  sourceSettings.qbittorrent.requireKnownAccessBasis = false;
  return {
    book: {
      ...EXAMPLE_BOOK,
      title,
      short: title,
      authors: ['Elias M. Stein'],
      isbn: null,
      sourcePath: null,
    },
    policy: {
      ...defaultDocumentAcquisitionPolicy(),
      enabled: true,
      sourceSettings,
    },
  };
}

describe('qBittorrent title evidence gate', () => {
  it('blocks same-author wrong-volume search hits while keeping the right volume', () => {
    const request = requestFor('Functional analysis');
    const result = classifySearchResults(
      [
        {
          fileName: 'Stein E Lectures in Analysis Vol 2 Complex Analysis 2003',
          fileUrl: 'magnet:?xt=urn:btih:complexanalysis',
          siteUrl: 'https://www.limetorrents.lol',
          nbSeeders: 8,
          nbLeechers: 1,
          fileSize: 12_000,
        },
        {
          fileName:
            'Stein E Lectures in Analysis Vol 4 Functional Analysis 2012',
          fileUrl: 'magnet:?xt=urn:btih:functionalanalysis',
          siteUrl: 'https://www.limetorrents.lol',
          nbSeeders: 12,
          nbLeechers: 4,
          fileSize: 22_000,
        },
      ],
      [
        {
          enabled: true,
          fullName: 'LimeTorrents',
          name: 'limetorrents',
          supportedCategories: [{ id: 'all', name: 'All categories' }],
          url: 'https://www.limetorrents.lol',
        },
      ],
      request,
      'test',
      { plugin: 'limetorrents' },
    );

    expect(result.candidates.map((candidate) => candidate.title)).toEqual([
      'Stein E Lectures in Analysis Vol 4 Functional Analysis 2012',
    ]);
    expect(result.blockedCandidates[0]?.blockedReasons).toContain(
      'missing distinctive title token',
    );
  });

  it('does not let stale local torrents match sibling titles by author alone', () => {
    const request = requestFor('Fourier Analysis');
    const candidate = candidateFromLiveTorrent(
      {
        hash: 'abc',
        name: 'Stein E. Lectures in Analysis. Vol 2. Complex Analysis 2003',
        sourceUrl: 'magnet:?xt=urn:btih:abc',
        category: 'difficulty-engine',
        savePath: '/repo/output/data/documents',
        contentPath:
          '/repo/output/data/documents/Stein E. Lectures in Analysis. Vol 2. Complex Analysis 2003.pdf',
        availability: {
          seeders: 0,
          peers: 0,
          progress: 1,
          state: 'stalledUP',
        },
        staleStatus: 'complete',
        files: [
          {
            index: 0,
            name: 'Stein E. Lectures in Analysis. Vol 2. Complex Analysis 2003.pdf',
            sizeBytes: 10_000,
            progress: 1,
            priority: 7,
            availability: 1,
            pdfEligible: true,
            pdfRejectionReasons: [],
          },
        ],
        eligiblePdfCount: 1,
      },
      request,
    );

    expect(candidate).toBeNull();
  });

  it('blocks same-author adjacent-topic results that miss the core title phrase', () => {
    const result = classifySearchResults(
      [
        {
          fileName: 'Self D. Audio Power Amplifier Design 6ed 2013',
          fileUrl: 'magnet:?xt=urn:btih:poweramp',
          siteUrl: 'https://www.limetorrents.lol',
          nbSeeders: 5,
          nbLeechers: 1,
          fileSize: 12_000,
        },
      ],
      [
        {
          enabled: true,
          fullName: 'LimeTorrents',
          name: 'limetorrents',
          supportedCategories: [{ id: 'all', name: 'All categories' }],
          url: 'https://www.limetorrents.lol',
        },
      ],
      {
        ...requestFor('Small Signal Audio Design'),
        book: {
          ...requestFor('Small Signal Audio Design').book,
          authors: ['Douglas Self'],
        },
      },
      'test',
      { plugin: 'limetorrents' },
    );

    expect(result.candidates).toEqual([]);
    expect(result.blockedCandidates[0]?.blockedReasons).toContain(
      'missing distinctive title token',
    );
  });
});
