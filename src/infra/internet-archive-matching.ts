import type { BookRecord } from '../core/types';
import { cleanedIsbn, isFullIsbnQuery } from './book-search';

export interface ArchiveSearchDoc {
  identifier?: string;
  title?: string;
  creator?: string | string[];
}

const ARCHIVE_SEARCH_ROWS = 6;

function tokenSet(value: string | undefined): Set<string> {
  return new Set(
    String(value ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .filter((part) => part.length > 2),
  );
}

export function archiveTokenSimilarity(left: string | undefined, right: string | undefined): number {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  let shared = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) shared += 1;
  });
  return shared / Math.max(1, leftTokens.size + rightTokens.size - shared);
}

function creatorText(value: ArchiveSearchDoc['creator']): string {
  return Array.isArray(value) ? value.join(' ') : String(value ?? '');
}

export function creatorConflictsForGenericTitle(book: BookRecord, doc: ArchiveSearchDoc): boolean {
  const creator = creatorText(doc.creator);
  if (!creator || !book.authors.length) return false;
  const authorScore = Math.max(
    0,
    ...book.authors.map((author) => archiveTokenSimilarity(author, creator)),
  );
  return tokenSet(book.title).size <= 3 && authorScore < 0.12;
}

export function archiveRelevance(book: BookRecord, doc: ArchiveSearchDoc): number {
  const titleScore = archiveTokenSimilarity(book.title, doc.title);
  const authorScore = Math.max(
    0,
    ...book.authors.map((author) => archiveTokenSimilarity(author, creatorText(doc.creator))),
  );
  return titleScore * 0.78 + authorScore * 0.22;
}

export function archiveSearchUrls(book: BookRecord): string[] {
  const urls: string[] = [];
  const isbn = isFullIsbnQuery(book.isbn ?? '') ? cleanedIsbn(book.isbn ?? '') : '';
  const buildUrl = (query: string): string => {
    const params = new URLSearchParams();
    params.set('q', query);
    ['identifier', 'title', 'creator'].forEach((field) => params.append('fl[]', field));
    params.set('rows', String(ARCHIVE_SEARCH_ROWS));
    params.set('output', 'json');
    return `https://archive.org/advancedsearch.php?${params.toString()}`;
  };
  if (isbn) urls.push(buildUrl(`isbn:(${isbn})`));
  if (book.title.trim()) urls.push(buildUrl(`title:("${book.title.replace(/"/g, ' ')}")`));
  return Array.from(new Set(urls));
}
