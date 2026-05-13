import { describe, expect, it } from 'vitest';

import { EXAMPLE_BOOK, createDefaultReadingScopeSettings } from '../../src/core/defaults';
import { classifyReadingSections } from '../../src/core/section-classifier';
import type { BookRecord } from '../../src/core/types';

function bookWithChapters(chapters: string[]): BookRecord {
  return {
    ...EXAMPLE_BOOK,
    id: 'sections',
    title: 'Section Classification Fixture',
    enrichment: {
      ...EXAMPLE_BOOK.enrichment,
      chapters,
      tocSource: 'manual',
    },
  };
}

describe('section classifier', () => {
  it('does not skip core technical chapters that contain reference words', () => {
    const sections = classifyReadingSections(
      bookWithChapters([
        'Solutions of Differential Equations',
        'Index Theory',
      ]),
      createDefaultReadingScopeSettings(),
    );

    expect(sections.map((section) => section.kind)).toEqual(['core', 'core']);
    expect(sections.map((section) => section.skipped)).toEqual([false, false]);
  });

  it('still skips explicit back-matter and exercise-answer sections', () => {
    const sections = classifyReadingSections(
      bookWithChapters([
        'Index',
        'Author Index',
        'Solutions to Exercises',
        'Reference Tables',
      ]),
      createDefaultReadingScopeSettings(),
    );

    expect(sections.map((section) => section.kind)).toEqual([
      'bibliography_index',
      'bibliography_index',
      'solutions_reference',
      'solutions_reference',
    ]);
    expect(sections.every((section) => section.skipped)).toBe(true);
  });
});
