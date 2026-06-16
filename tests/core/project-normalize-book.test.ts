import { describe, expect, it } from 'vitest';

import { normalizeProject } from '../../src/core/project-file';

describe('book enrichment normalization', () => {
  it('realigns chapter page ranges when a middle chapter is removed on load', () => {
    const project = normalizeProject({
      version: 1,
      library: {
        books: {
          alpha: {
            title: 'Alpha',
            short: 'Alpha',
            pages: 200,
            enrichment: {
              chapters: [
                'Introduction',
                'This book gives a long summary of the subject and explains why the material matters. It is not a table of contents entry.',
                'Chapter 1 Foundations',
              ],
              chapterPageRanges: [
                { start: 5, end: 19 },
                { start: 20, end: 40 },
                { start: 41, end: 60 },
              ],
            },
          },
        },
      },
      manualOverrides: { schedule: {}, deferred: {}, actuals: {} },
      constraints: {},
      enrichmentCache: {},
      uiPreferences: {},
    });

    const enrichment = project.library.books.alpha.enrichment;
    expect(enrichment.chapters).toEqual(['Introduction', 'Chapter 1 Foundations']);
    // Surviving chapters keep the ranges from their ORIGINAL positions: the
    // removed middle chapter's range is discarded, not shifted onto the next
    // chapter (which previously corrupted effective reading pages).
    expect(enrichment.chapterPageRanges).toEqual([
      { start: 5, end: 19 },
      { start: 41, end: 60 },
    ]);
  });
});
