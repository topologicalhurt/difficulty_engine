import { sanitizeChapterTitles } from '../core/chapter-titles';
import { normalizeOpenLibraryKey } from '../core/openlibrary-keys';
import { safeNumber } from '../core/utils';
import type {
  EditionResponse,
  SearchResponse,
  WorkResponse,
} from './openlibrary-types';
import {
  chooseBestDoc,
  fetchAuthorNames,
  normalizeChapters,
  normalizeDescription,
  searchSuggestionFromDoc,
} from './openlibrary-search';
import { extractPublishedYear, firstValidIsbn } from './source-metadata';
import type { StrategyContext } from './toc-strategy-context';
import type { StrategyCandidate } from './toc-merge';

function candidateFromEdition(
  edition: EditionResponse,
  authors: string[],
): StrategyCandidate {
  const chapters = sanitizeChapterTitles(
    normalizeChapters(edition.table_of_contents),
    { source: 'structured' },
  );
  return {
    provider: 'openlibrary',
    sourceUrl: `https://openlibrary.org${edition.key ?? '/'}`,
    confidence: 0.88,
    chapters,
    description: normalizeDescription(edition.description),
    subjects: edition.subjects ?? [],
    pages: edition.number_of_pages ?? null,
    publisher: edition.publishers?.[0] ?? '',
    year: extractPublishedYear(edition.publish_date),
    authors,
    isbn: firstValidIsbn([
      ...(edition.isbn_13 ?? []),
      ...(edition.isbn_10 ?? []),
    ]),
    openLibraryKey: normalizeOpenLibraryKey(edition.key, 'edition'),
    openLibraryEditionKey: normalizeOpenLibraryKey(edition.key, 'edition'),
    openLibraryWorkKey: normalizeOpenLibraryKey(
      edition.works?.[0]?.key,
      'work',
    ),
    tocSource: chapters.length ? 'openlibrary' : 'none',
  };
}

function candidateFromWork(
  work: WorkResponse,
  workKey: string,
): StrategyCandidate {
  return {
    provider: 'openlibrary',
    sourceUrl: `https://openlibrary.org${workKey}`,
    confidence: 0.74,
    description: normalizeDescription(work.description),
    subjects: work.subjects ?? [],
    openLibraryKey: normalizeOpenLibraryKey(work.key ?? workKey, 'work'),
    openLibraryWorkKey: normalizeOpenLibraryKey(work.key ?? workKey, 'work'),
  };
}

export async function openLibraryEditionCandidate(
  context: StrategyContext,
): Promise<StrategyCandidate | null> {
  const isbn = firstValidIsbn([context.book.isbn]) ?? '';
  const editionKey =
    normalizeOpenLibraryKey(context.book.openLibraryEditionKey, 'edition') ??
    normalizeOpenLibraryKey(context.book.openLibraryKey, 'edition') ??
    null;
  const urls = [
    isbn ? `https://openlibrary.org/isbn/${isbn}.json` : '',
    editionKey ? `https://openlibrary.org${editionKey}.json` : '',
  ].filter(Boolean);

  for (const url of urls) {
    try {
      const edition = await context.fetchJson<EditionResponse>(
        url,
        context.signal,
      );
      const authors = await fetchAuthorNames(
        context.fetchJson,
        edition.authors ?? [],
        context.signal,
      );
      return candidateFromEdition(edition, authors);
    } catch {
      continue;
    }
  }
  return null;
}

export async function openLibraryWorkCandidate(
  context: StrategyContext,
  preferredWorkKey?: string | null,
): Promise<StrategyCandidate | null> {
  const workKey =
    normalizeOpenLibraryKey(preferredWorkKey, 'work') ??
    normalizeOpenLibraryKey(context.book.openLibraryWorkKey, 'work') ??
    null;
  if (!workKey) {
    return null;
  }
  try {
    const work = await context.fetchJson<WorkResponse>(
      `https://openlibrary.org${workKey}.json`,
      context.signal,
    );
    return candidateFromWork(work, workKey);
  } catch {
    return null;
  }
}

export async function openLibrarySearchCandidates(
  context: StrategyContext,
): Promise<StrategyCandidate[]> {
  const params = new URLSearchParams({
    title: context.book.title,
    author: context.book.authors[0] ?? '',
    limit: '5',
  });
  const response = await context
    .fetchJson<SearchResponse>(
      `https://openlibrary.org/search.json?${params.toString()}`,
      context.signal,
    )
    .catch(() => ({ docs: [] }));
  const bestDoc = chooseBestDoc(context.book, response.docs ?? [], 5);
  if (!bestDoc) {
    return [];
  }

  const suggestion = searchSuggestionFromDoc(bestDoc);
  const candidates: StrategyCandidate[] = [];
  if (suggestion) {
    candidates.push({
      provider: 'openlibrary',
      sourceUrl: `https://openlibrary.org${suggestion.openLibraryKey ?? bestDoc.key ?? '/'}`,
      confidence: safeNumber(bestDoc.ratings_average ? 0.8 : 0.72, 0.72),
      description: suggestion.description,
      subjects: suggestion.subjects,
      pages: suggestion.pages,
      publisher: suggestion.publisher,
      year: suggestion.year,
      authors: suggestion.authors,
      isbn: suggestion.isbn,
      openLibraryKey: normalizeOpenLibraryKey(suggestion.openLibraryKey, 'any'),
      openLibraryEditionKey: normalizeOpenLibraryKey(
        suggestion.openLibraryEditionKey,
        'edition',
      ),
      openLibraryWorkKey: normalizeOpenLibraryKey(
        suggestion.openLibraryWorkKey,
        'work',
      ),
    });
  }

  const edition = suggestion?.openLibraryEditionKey
    ? await openLibraryEditionCandidate({
        ...context,
        book: {
          ...context.book,
          openLibraryEditionKey: suggestion.openLibraryEditionKey,
        },
      })
    : null;
  if (edition) {
    candidates.push(edition);
  }

  const work = await openLibraryWorkCandidate(
    context,
    suggestion?.openLibraryWorkKey ?? bestDoc.key ?? null,
  );
  if (work) {
    candidates.push(work);
  }

  return candidates;
}
