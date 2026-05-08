import { describe, expect, it } from 'vitest';

import { EXAMPLE_BOOK } from '../../src/core/defaults';
import type { SourceContentKind } from '../../src/core/types';
import { defaultDocumentAcquisitionPolicy } from '../../src/infra/document-acquisition';
import {
  qbittorrentSearchPatterns,
  qbittorrentSearchQueries,
  sortSearchCandidates,
} from '../../src/infra/qbittorrent-search';

describe('qBittorrent search patterns and ordering', () => {
  it('orders search candidates with the shared document content preference', () => {
    const request = {
      book: {
        ...EXAMPLE_BOOK,
        title: 'Precise Systems',
        authors: ['A. Author'],
        sourcePath: null,
      },
      policy: {
        ...defaultDocumentAcquisitionPolicy(),
        contentPreference: [
          'pdf',
          'text',
          'epub',
          'ocr_text',
        ] as SourceContentKind[],
      },
    };
    const common = {
      provider: 'qbittorrent' as const,
      title: 'Precise Systems 9781111111111',
      accessBasis: 'open_access' as const,
      confidence: 0.9,
      matchScore: 0.95,
      seeders: 12,
      peers: 1,
    };

    const sorted = sortSearchCandidates(
      [
        {
          ...common,
          id: 'text',
          sourceUrl: 'magnet:?xt=urn:btih:text',
          contentKind: 'text',
        },
        {
          ...common,
          id: 'pdf',
          sourceUrl: 'magnet:?xt=urn:btih:pdf',
          contentKind: 'pdf',
        },
      ],
      request,
    );

    expect(sorted.map((candidate) => candidate.id)).toEqual(['pdf', 'text']);
  });

  it('builds precise title and author fallback searches without edition noise', () => {
    const patterns = qbittorrentSearchPatterns({
      book: {
        ...EXAMPLE_BOOK,
        title: 'Practical Electronics for Inventors, 4th Edition',
        short: 'Practical Electronics',
        authors: ['Paul Scherz'],
        isbn: null,
      },
      policy: {
        ...defaultDocumentAcquisitionPolicy(),
        enabled: true,
      },
    });

    expect(patterns).toEqual([
      'practical electronics for inventors',
      'practical electronics for inventors scherz',
      'scherz electronics inventors',
      'practical electronics',
    ]);
    expect(patterns.join(' ')).not.toMatch(/4th|Edition/i);
  });

  it('generates broad and author-topic queries for noisy technical titles', () => {
    const queries = qbittorrentSearchQueries({
      book: {
        ...EXAMPLE_BOOK,
        title: 'Discrete-time Signal Processing, 2nd, Second Edition',
        short: 'Discrete-time Signal Processing',
        authors: ['Ronald W. Oppenheim Alan V. / Schafer'],
        isbn: null,
      },
      policy: {
        ...defaultDocumentAcquisitionPolicy(),
        enabled: true,
      },
    });

    expect(queries).toEqual(
      expect.arrayContaining([
        { intent: 'core_title', pattern: 'discrete time signal processing' },
        {
          intent: 'hyphenated_title',
          pattern: 'discrete-time signal processing',
        },
        {
          intent: 'author_topic',
          pattern: 'oppenheim schafer signal processing',
        },
      ]),
    );
  });
});
