import { describe, expect, it } from 'vitest';

import { chooseBestDoc } from '../../src/infra/openlibrary-search';
import type { BookRecord } from '../../src/core/types';
import { createDefaultSourceSettings } from '../../src/core/default-source-settings';
import { createOpenLibrarySearchRunner } from '../../src/infra/enrichment-search';

function book(title: string): BookRecord {
  return {
    id: 'book-1',
    title,
    short: title,
    authors: ['A. Author'],
    displayGroup: 'Core',
    manualSeedDifficulty: 5,
    pages: 250,
    subjects: [],
    publisher: '',
    isbn: null,
    year: null,
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
    enrichment: { chapters: [], description: '', olSubjects: [], tocSource: 'none' },
  };
}

describe('Open Library result filtering', () => {
  it('rejects unrelated first-page documents instead of accepting the first result', () => {
    expect(
      chooseBestDoc(book('Functional Analysis'), [
        { title: 'Cooking With Herbs', author_name: ['Someone Else'] },
      ], 5),
    ).toBeUndefined();
  });

  it('accepts close title matches even when punctuation differs', () => {
    expect(
      chooseBestDoc(book('Functional Analysis'), [
        { title: 'Functional Analysis: An Introduction', author_name: ['A. Author'] },
      ], 5)?.title,
    ).toBe('Functional Analysis: An Introduction');
  });

  it('uses injected time for search cache expiry', async () => {
    let now = 1000;
    let calls = 0;
    const runner = createOpenLibrarySearchRunner({
      cacheTtlMs: 100,
      retryCount: 0,
      nowMs: () => now,
      jsonFetcher: async <T,>(): Promise<T> => {
        calls += 1;
        return {
          docs: [{ title: `Functional Analysis ${calls}`, author_name: ['A. Author'] }],
        } as T;
      },
    });
    const request = { query: 'functional analysis', sourceSettings: createDefaultSourceSettings() };

    expect((await runner.searchBooks(request)).results[0]?.title).toBe('Functional Analysis 1');
    expect((await runner.searchBooks(request)).results[0]?.title).toBe('Functional Analysis 1');
    now = 1101;
    expect((await runner.searchBooks(request)).results[0]?.title).toBe('Functional Analysis 2');
  });
});
