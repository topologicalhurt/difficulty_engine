import { describe, expect, it } from 'vitest';

import type { BookRecord } from '../../src/core/types';
import { fetchInternetArchiveCandidates } from '../../src/infra/internet-archive';

function book(): BookRecord {
  return {
    id: 'complex',
    title: 'Complex analysis',
    short: 'Complex',
    authors: ['Elias M. Stein'],
    displayGroup: 'Analysis',
    manualSeedDifficulty: 6,
    pages: 392,
    subjects: [],
    publisher: '',
    isbn: null,
    year: 2026,
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

describe('Internet Archive TOC candidates', () => {
  it('rejects wrong-author generic-title matches before fetching OCR text', async () => {
    const metadataUrls: string[] = [];
    const candidates = await fetchInternetArchiveCandidates({
      book: book(),
      fetchJson: async <T>(url: string): Promise<T> => {
        if (url.startsWith('https://archive.org/advancedsearch.php?')) {
          return {
            response: {
              docs: [
                {
                  identifier: 'wrong-author',
                  title: 'Complex analysis',
                  creator: 'Eberhard Freitag',
                },
                {
                  identifier: 'no-creator-same-title',
                  title: 'Complex analysis',
                },
              ],
            },
          } as T;
        }
        metadataUrls.push(url);
        return {
          metadata: { title: 'Complex analysis' },
          files: [{ name: 'complex_djvu.txt', format: 'DjVuTXT', size: '1200' }],
        } as T;
      },
      fetchImpl: async () =>
        new Response('Contents\nChapter 1 Foundations 1\nChapter 2 Contours 24', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        }),
    });

    expect(metadataUrls).toEqual(['https://archive.org/metadata/no-creator-same-title']);
    expect(candidates[0]?.chapters).toEqual([
      'Contents',
      'Chapter 1 Foundations',
      'Chapter 2 Contours',
    ]);
  });
});
