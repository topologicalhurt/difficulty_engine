import type {
  BookRecord,
  BookSearchSuggestion,
  PlannerProjectV1,
} from './types';
import { normalizedIsbn } from './isbn';
import { matchTokens } from './matchers';

export { normalizedIsbn };

function normalizedTitle(value: string): string {
  return matchTokens(value).join(' ');
}

function normalizedAuthors(authors: string[]): string {
  return authors
    .map((author) => matchTokens(author).join(' '))
    .filter(Boolean)
    .join('|');
}

export function bookIdentityKey(
  candidate: Pick<BookRecord, 'title' | 'authors' | 'isbn'>,
): string {
  const isbn = normalizedIsbn(candidate.isbn);
  if (isbn) {
    return `isbn:${isbn}`;
  }
  return `text:${normalizedTitle(candidate.title)}::${normalizedAuthors(candidate.authors)}`;
}

export function suggestionIdentityKey(
  suggestion: Pick<BookSearchSuggestion, 'title' | 'authors' | 'isbn'>,
): string {
  return bookIdentityKey({
    title: suggestion.title,
    authors: suggestion.authors,
    isbn: suggestion.isbn,
  });
}

export function findMatchingBook(
  project: Pick<PlannerProjectV1, 'library'>,
  suggestion: Pick<BookSearchSuggestion, 'title' | 'authors' | 'isbn'>,
): BookRecord | undefined {
  const isbn = normalizedIsbn(suggestion.isbn);
  if (isbn) {
    const isbnMatch = Object.values(project.library.books).find(
      (book) => normalizedIsbn(book.isbn) === isbn,
    );
    if (isbnMatch) {
      return isbnMatch;
    }
  }
  const textKey = suggestionIdentityKey(suggestion);
  return Object.values(project.library.books).find(
    (book) => bookIdentityKey(book) === textKey,
  );
}
