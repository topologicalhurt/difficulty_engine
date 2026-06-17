import { describe, expect, it } from 'vitest';

import { normalizeProject } from '../../src/core/project-file';

function normalizeOneBook(raw: Record<string, unknown>) {
  const project = normalizeProject({
    version: 1,
    library: { books: { alpha: { title: 'Alpha', short: 'Alpha', ...raw } } },
    manualOverrides: { schedule: {}, deferred: {}, actuals: {} },
    constraints: {},
    enrichmentCache: {},
    uiPreferences: {},
  });
  return project.library.books.alpha;
}

describe('book field normalization bounds', () => {
  it('clamps manualSeedDifficulty to [1,10] and bounds pages on load', () => {
    expect(normalizeOneBook({ manualSeedDifficulty: 1e6 }).manualSeedDifficulty).toBe(10);
    expect(normalizeOneBook({ manualSeedDifficulty: -4 }).manualSeedDifficulty).toBe(1);
    expect(normalizeOneBook({ pages: 5_000_000 }).pages).toBe(100000);
    expect(normalizeOneBook({ pages: 0 }).pages).toBe(1);
  });

  it('preserves a plausible-length ISBN with a bad check digit', () => {
    // 13 digits, bad checksum -> kept for display round-trip.
    expect(normalizeOneBook({ isbn: '9781234567890' }).isbn).toBe('9781234567890');
    // Non-ISBN junk still normalizes to null.
    expect(normalizeOneBook({ isbn: 'not an isbn' }).isbn).toBeNull();
    // A valid ISBN-13 is kept as-is.
    expect(normalizeOneBook({ isbn: '978-0-13-468599-1' }).isbn).toBe('9780134685991');
  });
});

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
