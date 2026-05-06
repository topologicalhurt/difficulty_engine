import { describe, expect, it } from 'vitest';

import {
  joinSplitTocLines,
  normalizeDocumentLines,
  removeMarkerOnlyDuplicates,
} from '../../src/infra/toc-line-normalization';

describe('TOC line normalization helpers', () => {
  it('normalizes document lines while rejecting short and PDF noise lines', () => {
    expect(
      normalizeDocumentLines([
        '  Chapter   1   Signals  ',
        'x',
        'endobj',
        'Chapter 2 Systems',
      ].join('\n')),
    ).toEqual(['Chapter 1 Signals', 'Chapter 2 Systems']);
  });

  it('joins split marker/title TOC lines', () => {
    expect(joinSplitTocLines(['Chapter 1', 'Signals and Systems'])).toEqual([
      'Chapter 1 Signals and Systems',
    ]);
  });

  it('removes marker-only entries when a richer version exists', () => {
    expect(
      removeMarkerOnlyDuplicates([
        'Chapter 1',
        'Chapter 1 Signals',
        'Chapter 2 Systems',
      ]),
    ).toEqual(['Chapter 1 Signals', 'Chapter 2 Systems']);
  });
});
