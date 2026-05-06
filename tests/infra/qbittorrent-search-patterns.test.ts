import { describe, expect, it } from 'vitest';

import { EXAMPLE_BOOK } from '../../src/core/defaults';
import type { SourceContentKind } from '../../src/core/types';
import { defaultDocumentAcquisitionPolicy } from '../../src/infra/document-acquisition';
import {
  qbittorrentSearchPatterns,
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
      'practical electronics for inventors paul scherz',
      'practical electronics for inventors scherz',
      'practical electronics paul scherz',
      'practical electronics scherz',
      'practical electronics for inventors',
      'practical electronics',
    ]);
    expect(patterns.join(' ')).not.toMatch(/4th|Edition/i);
  });
});
