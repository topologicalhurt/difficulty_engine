import { describe, expect, it } from 'vitest';

import { EXAMPLE_BOOK, createDefaultReadingScopeSettings } from '../../src/core/defaults';
import { effectiveReadingPagesForBook } from '../../src/core/effective-pages';
import type { BookRecord } from '../../src/core/types';

function scopedBook(): BookRecord {
  return {
    ...EXAMPLE_BOOK,
    id: 'scope-ranges',
    title: 'Scope Ranges',
    pages: 620,
    enrichment: {
      ...EXAMPLE_BOOK.enrichment,
      tocSource: 'pdf',
      chapters: [
        'Preface',
        'Contents',
        'Core Methods',
        'Appendix A Reference Tables',
        'Index',
      ],
      chapterPageRanges: [
        { start: 1, end: 4 },
        { start: 5, end: 11 },
        { start: 12, end: 359 },
        { start: 360, end: 589 },
        { start: 590, end: null },
      ],
    },
  };
}

describe('effective reading pages', () => {
  it('uses learned section page ranges instead of average section counts', () => {
    const result = effectiveReadingPagesForBook(
      scopedBook(),
      createDefaultReadingScopeSettings(),
    );

    expect(result.skippedPages).toBe(272);
    expect(result.effectivePages).toBe(348);
    expect(result.bindingReason).toContain('page-ranged');
    expect(
      result.skippedSections.find((section) => section.title.startsWith('Appendix'))
        ?.estimatedPages,
    ).toBe(230);
  });
});
