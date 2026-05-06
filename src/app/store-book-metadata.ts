import { normalizedIsbn } from '../core/book-identity';
import { EXAMPLE_BOOK } from '../core/defaults';
import { normalizeOpenLibraryKey } from '../core/openlibrary-keys';
import type { BookRecord, BookSearchSuggestion } from '../core/types';
import { uniqueCompactStrings } from '../core/utils';

const PLACEHOLDER_PAGE_COUNTS = new Set<number>([EXAMPLE_BOOK.pages, 250]);

function shortLabelFromTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length <= 22) {
    return trimmed;
  }
  return `${trimmed.slice(0, 19).trimEnd()}...`;
}

function incomingPagesOrCurrent(
  currentPages: number,
  incomingPages: number | null | undefined,
): number {
  if (!incomingPages) return currentPages;
  return currentPages <= 1 || PLACEHOLDER_PAGE_COUNTS.has(currentPages)
    ? incomingPages
    : currentPages;
}

export function bookFromSuggestion(
  id: string,
  suggestion: BookSearchSuggestion,
): BookRecord {
  return {
    ...EXAMPLE_BOOK,
    id,
    title: suggestion.title,
    short: shortLabelFromTitle(suggestion.title),
    authors: suggestion.authors.length
      ? suggestion.authors
      : EXAMPLE_BOOK.authors,
    pages: suggestion.pages ?? 250,
    subjects: suggestion.subjects.slice(0, 12),
    publisher: suggestion.publisher,
    isbn: normalizedIsbn(suggestion.isbn) || null,
    year: suggestion.year,
    openLibraryKey: normalizeOpenLibraryKey(suggestion.openLibraryKey, 'any'),
    openLibraryEditionKey: normalizeOpenLibraryKey(
      suggestion.openLibraryEditionKey,
      'edition',
    ),
    openLibraryWorkKey: normalizeOpenLibraryKey(
      suggestion.openLibraryWorkKey,
      'work',
    ),
    googleBooksId: suggestion.googleBooksId ?? null,
    enrichment: {
      chapters: [],
      description: suggestion.description,
      olSubjects: suggestion.subjects.slice(0, 20),
      tocSource: 'search',
    },
  };
}

export function mergeSuggestionIntoBook(
  book: BookRecord,
  suggestion: BookSearchSuggestion,
): BookRecord {
  const mergedSubjects = uniqueCompactStrings([
    ...book.subjects,
    ...suggestion.subjects,
  ]).slice(0, 20);
  const mergedOlSubjects = uniqueCompactStrings([
    ...book.enrichment.olSubjects,
    ...suggestion.subjects,
  ]).slice(0, 30);
  const nextIsbn =
    normalizedIsbn(book.isbn) || normalizedIsbn(suggestion.isbn) || null;
  return {
    ...book,
    authors: book.authors.length ? book.authors : suggestion.authors,
    pages: incomingPagesOrCurrent(book.pages, suggestion.pages),
    subjects: mergedSubjects,
    publisher: book.publisher || suggestion.publisher,
    isbn: nextIsbn,
    year: book.year ?? suggestion.year,
    openLibraryKey: normalizeOpenLibraryKey(
      book.openLibraryKey ?? suggestion.openLibraryKey,
      'any',
    ),
    openLibraryEditionKey: normalizeOpenLibraryKey(
      book.openLibraryEditionKey ?? suggestion.openLibraryEditionKey,
      'edition',
    ),
    openLibraryWorkKey: normalizeOpenLibraryKey(
      book.openLibraryWorkKey ?? suggestion.openLibraryWorkKey,
      'work',
    ),
    googleBooksId: book.googleBooksId ?? suggestion.googleBooksId ?? null,
    enrichment: {
      ...book.enrichment,
      description: book.enrichment.description || suggestion.description,
      olSubjects: mergedOlSubjects,
      tocSource:
        book.enrichment.tocSource === 'none' && suggestion.description
          ? 'search'
          : book.enrichment.tocSource,
    },
  };
}

export function mergeEnrichmentIntoBook(
  book: BookRecord,
  patch: Partial<BookRecord>,
): BookRecord {
  const mergedSubjects = uniqueCompactStrings([
    ...book.subjects,
    ...(patch.subjects ?? []),
  ]).slice(0, 30);
  const nextPages = incomingPagesOrCurrent(book.pages, patch.pages);
  return {
    ...book,
    title: patch.title ?? book.title,
    short: patch.short ?? book.short,
    authors: patch.authors?.length ? patch.authors : book.authors,
    pages: nextPages,
    subjects: mergedSubjects,
    publisher: book.publisher || patch.publisher || '',
    isbn: normalizedIsbn(book.isbn) || normalizedIsbn(patch.isbn) || null,
    year: book.year ?? patch.year ?? null,
    sourcePath: patch.sourcePath ?? book.sourcePath ?? null,
    documents: patch.documents ?? book.documents ?? [],
    selectedDocumentId:
      patch.selectedDocumentId ?? book.selectedDocumentId ?? null,
    openLibraryKey: normalizeOpenLibraryKey(
      patch.openLibraryKey ?? book.openLibraryKey,
      'any',
    ),
    openLibraryEditionKey: normalizeOpenLibraryKey(
      patch.openLibraryEditionKey ?? book.openLibraryEditionKey,
      'edition',
    ),
    openLibraryWorkKey: normalizeOpenLibraryKey(
      patch.openLibraryWorkKey ?? book.openLibraryWorkKey,
      'work',
    ),
    googleBooksId: patch.googleBooksId ?? book.googleBooksId ?? null,
    enrichment: {
      ...book.enrichment,
      ...(patch.enrichment ?? {}),
      olSubjects: uniqueCompactStrings([
        ...book.enrichment.olSubjects,
        ...(patch.enrichment?.olSubjects ?? []),
      ]).slice(0, 40),
      chapters: patch.enrichment?.chapters?.length
        ? patch.enrichment.chapters
        : book.enrichment.chapters,
      description: patch.enrichment?.description || book.enrichment.description,
      tocSource: patch.enrichment?.tocSource ?? book.enrichment.tocSource,
      provenance: {
        ...book.enrichment.provenance,
        ...(patch.enrichment?.provenance ?? {}),
      },
    },
  };
}
