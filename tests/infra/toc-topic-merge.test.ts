import { describe, expect, it } from 'vitest';

import type { BookRecord } from '../../src/core/types';
import { mergeStrategyCandidates } from '../../src/infra/toc-merge';

function makeBook(): BookRecord {
  return {
    id: 'book-1',
    title: 'Signals and Systems',
    short: 'Signals',
    authors: ['A. Author'],
    displayGroup: 'Core',
    manualSeedDifficulty: 5,
    pages: 250,
    subjects: [],
    publisher: '',
    isbn: '9781234567897',
    year: null,
    sourcePath: null,
    openLibraryKey: null,
    openLibraryEditionKey: null,
    openLibraryWorkKey: null,
    googleBooksId: null,
    manualPrereqs: [],
    manualCoStudy: [],
    owned: true,
    planOrder: 0,
    allowPrereqOverlap: false,
    lockDiff: false,
    noPropOut: false,
    ignored: false,
    constantRD: false,
    completed: false,
    enrichment: {
      chapters: [],
      description: '',
      olSubjects: [],
      tocSource: 'none',
    },
  };
}

describe('TOC topic merge', () => {
  it('does not copy estimated candidate ranges into planner truth', () => {
    const resolution = mergeStrategyCandidates(makeBook(), [
      {
        provider: 'direct_url',
        sourceUrl: 'https://example.test/book.pdf',
        confidence: 0.8,
        chapters: [
          'Chapter 1 Signals',
          'Chapter 2 Systems',
          'Chapter 3 Filters',
        ],
        estimatedChapterPageRanges: [{ start: 1, end: 40 }, null, null],
        chapterPageRangeTrust: ['estimated', 'missing', 'missing'],
        pageRangeTrustStatus: 'estimated',
        tocSource: 'pdf',
        strategy: 'explicit_toc_region',
      },
    ]);

    expect(resolution.enrichment.chapters).toHaveLength(3);
    expect(resolution.enrichment.chapterPageRanges).toBeUndefined();
    expect(
      resolution.enrichment.provenance?.chapters?.pageRangeTrustStatus,
    ).toBe('estimated');
  });

  it('keeps a PDF source when only topic rows were extracted', () => {
    const resolution = mergeStrategyCandidates(makeBook(), [
      {
        provider: 'direct_url',
        sourceUrl: 'https://example.test/book.pdf',
        confidence: 0.82,
        chapters: [],
        topics: ['1.1 Signals', '1.2 Systems'],
        topicPageRanges: [
          { start: 10, end: 20 },
          { start: 21, end: null },
        ],
        tocSource: 'pdf',
        strategy: 'explicit_toc_region',
      },
    ]);

    expect(resolution.enrichment.chapters).toEqual([]);
    expect(resolution.enrichment.topics).toEqual(['1.1 Signals', '1.2 Systems']);
    expect(resolution.enrichment.tocSource).toBe('pdf');
    expect(resolution.enrichment.provenance?.topics?.provider).toBe(
      'direct_url',
    );
  });
});
