import { sanitizeChapterTitles } from '../core/chapter-titles';
import { normalizeOpenLibraryKey } from '../core/openlibrary-keys';
import type { BookRecord } from '../core/types';
import type { StrategyCandidate } from './toc-merge';

export function existingLocalCandidate(
  book: BookRecord,
): StrategyCandidate | null {
  const chapters = sanitizeChapterTitles(book.enrichment.chapters, {
    source: 'imported',
  });
  const hasLocalData =
    chapters.length > 0 ||
    Boolean(book.enrichment.description) ||
    book.subjects.length > 0 ||
    book.enrichment.olSubjects.length > 0;
  if (!hasLocalData) {
    return null;
  }
  return {
    provider: 'manual',
    sourceUrl: 'local://project',
    confidence: 1,
    chapters,
    chapterPageRanges: book.enrichment.chapterPageRanges,
    description: book.enrichment.description,
    subjects: [...book.subjects, ...book.enrichment.olSubjects],
    pages: book.pages,
    publisher: book.publisher,
    year: book.year,
    authors: book.authors,
    isbn: book.isbn,
    openLibraryKey: normalizeOpenLibraryKey(book.openLibraryKey, 'any'),
    openLibraryEditionKey: normalizeOpenLibraryKey(
      book.openLibraryEditionKey,
      'edition',
    ),
    openLibraryWorkKey: normalizeOpenLibraryKey(
      book.openLibraryWorkKey,
      'work',
    ),
    googleBooksId: book.googleBooksId ?? null,
    tocSource: book.enrichment.tocSource,
  };
}
