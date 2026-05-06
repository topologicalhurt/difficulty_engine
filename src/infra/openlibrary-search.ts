import type { BookSearchSuggestion, EnrichmentRequest } from '../core/types';
import {
  bookMatchDecision,
  jaccardTokenSimilarity,
  normalizeMatcherText,
} from '../core/matchers';
import { normalizeOpenLibraryKey } from '../core/openlibrary-keys';
import { uniqueCompactStrings } from '../core/utils';
import type {
  EditionResponse,
  OpenLibraryJsonFetcher,
  SearchDoc,
} from './openlibrary-types';
import {
  extractPublishedYear,
  firstValidIsbn,
  normalizeProviderText,
  normalizeProviderTextArray,
} from './source-metadata';

const MIN_DOC_RELEVANCE_SCORE = 1;

function docRelevanceScore(
  book: EnrichmentRequest['book'],
  doc: SearchDoc,
): number {
  const title = book.title.trim().toLowerCase();
  const author = book.authors[0]?.trim().toLowerCase();
  const isbn = firstValidIsbn([book.isbn]) ?? '';
  const decision = bookMatchDecision({
    target: { title: book.title, authors: book.authors, isbn: book.isbn },
    candidate: {
      title: doc.title,
      authors: doc.author_name,
      isbn: doc.isbn ?? null,
    },
    sourceMode: 'metadata',
    minimumScore: 0,
  });
  const titleSimilarity = jaccardTokenSimilarity(book.title, doc.title);
  return (
    (isbn && (doc.isbn ?? []).some((entry) => firstValidIsbn([entry]) === isbn)
      ? 5
      : 0) +
    (normalizeMatcherText(doc.title) === normalizeMatcherText(title) ? 3 : 0) +
    (titleSimilarity >= 0.65 ? titleSimilarity * 2 : 0) +
    (decision.reasons.includes('isbn_match') ? 1 : 0) +
    (decision.reasons.includes('author_support') ? 0.25 : 0) +
    (author && doc.author_name?.some((entry) => entry.toLowerCase() === author)
      ? 0.5
      : 0)
  );
}

export function stableSearchKey(
  query: string,
  offset: number,
  limit: number,
): string {
  return `${query.trim().toLowerCase()}::${offset}::${limit}`;
}

export function normalizeDescription(
  value: string | string[] | { value?: string } | undefined,
): string {
  if (!value) {
    return '';
  }
  if (Array.isArray(value)) {
    return normalizeProviderText(value.join(' '));
  }
  if (typeof value === 'object') {
    return normalizeProviderText(value.value);
  }
  return normalizeProviderText(value);
}

export function normalizeChapters(
  value: EditionResponse['table_of_contents'],
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) =>
      typeof entry === 'string' ? entry : normalizeProviderText(entry?.title),
    )
    .map(normalizeProviderText)
    .filter(Boolean)
    .slice(0, 80);
}

export function chooseBestDoc(
  book: EnrichmentRequest['book'],
  docs: SearchDoc[],
  searchResultLimit: number,
): SearchDoc | undefined {
  const ranked = docs
    .slice(0, searchResultLimit)
    .map((doc) => ({ doc, score: docRelevanceScore(book, doc) }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        String(left.doc.title ?? '').localeCompare(
          String(right.doc.title ?? ''),
        ),
    );
  return ranked[0] && ranked[0].score >= MIN_DOC_RELEVANCE_SCORE
    ? ranked[0].doc
    : undefined;
}

export function searchSuggestionFromDoc(
  doc: SearchDoc,
): BookSearchSuggestion | null {
  const title = normalizeProviderText(doc.title);
  if (!title) {
    return null;
  }
  const authors = normalizeProviderTextArray(doc.author_name ?? []);
  const publisher = normalizeProviderTextArray(doc.publisher ?? [])[0] ?? '';
  const isbn = firstValidIsbn(doc.isbn ?? []);
  const subjects = uniqueCompactStrings(
    [...(doc.subject ?? []), ...(doc.subject_facet ?? [])],
    10,
  );
  const subtitleParts = [
    authors.slice(0, 2).join(', '),
    doc.first_publish_year ? String(doc.first_publish_year) : '',
    publisher,
  ].filter(Boolean);
  return {
    key: doc.key || isbn || title.toLowerCase(),
    title,
    authors,
    subtitle: subtitleParts.join(' · '),
    isbn,
    year: doc.first_publish_year ?? null,
    publisher,
    subjects,
    description: normalizeDescription(doc.first_sentence),
    pages: doc.number_of_pages_median ?? null,
    openLibraryKey: normalizeOpenLibraryKey(doc.key, 'work'),
    openLibraryEditionKey: normalizeOpenLibraryKey(
      doc.cover_edition_key ?? doc.edition_key?.[0],
      'edition',
    ),
    openLibraryWorkKey: normalizeOpenLibraryKey(doc.key, 'work'),
  };
}

export function dedupeSuggestions(
  results: BookSearchSuggestion[],
): BookSearchSuggestion[] {
  const seen = new Set<string>();
  const deduped: BookSearchSuggestion[] = [];
  results.forEach((result) => {
    const key = [
      result.isbn?.trim().toUpperCase() || '',
      result.title.trim().toLowerCase(),
      result.authors[0]?.trim().toLowerCase() || '',
    ].join('::');
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    deduped.push(result);
  });
  return deduped;
}

export async function fetchAuthorNames(
  fetchJson: OpenLibraryJsonFetcher,
  authorRefs: Array<{ key?: string }>,
  signal?: AbortSignal,
): Promise<string[]> {
  const names = await Promise.all(
    authorRefs.map(async (authorRef) => {
      if (!authorRef?.key) {
        return '';
      }
      try {
        const author = await fetchJson<{ name?: string }>(
          `https://openlibrary.org${authorRef.key}.json`,
          signal,
        );
        return String(author.name ?? '').trim();
      } catch {
        return '';
      }
    }),
  );
  return names.filter(Boolean);
}

export async function isbnSuggestion(
  fetchJson: OpenLibraryJsonFetcher,
  query: string,
  signal?: AbortSignal,
): Promise<BookSearchSuggestion | null> {
  const isbn = firstValidIsbn([query])?.toUpperCase() ?? '';
  if (!isbn) {
    return null;
  }
  try {
    const edition = await fetchJson<EditionResponse>(
      `https://openlibrary.org/isbn/${isbn}.json`,
      signal,
    );
    const authors = await fetchAuthorNames(
      fetchJson,
      edition.authors ?? [],
      signal,
    );
    const year = extractPublishedYear(edition.publish_date);
    return {
      key: edition.key || isbn,
      title: normalizeProviderText(edition.title) || isbn,
      authors,
      subtitle: [
        authors.slice(0, 2).join(', '),
        year ? String(year) : '',
        (edition.publishers ?? [])[0] ?? '',
      ]
        .filter(Boolean)
        .join(' · '),
      isbn,
      year,
      publisher: (edition.publishers ?? [])[0] ?? '',
      subjects: uniqueCompactStrings(edition.subjects ?? [], 10),
      description: normalizeDescription(edition.description),
      pages: edition.number_of_pages ?? null,
      openLibraryKey: edition.key ?? null,
      openLibraryEditionKey: edition.key ?? null,
      openLibraryWorkKey: edition.works?.[0]?.key ?? null,
    };
  } catch {
    return null;
  }
}
