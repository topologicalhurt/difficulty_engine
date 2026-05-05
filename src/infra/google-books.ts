import type { BookRecord } from '../core/types';
import { cleanedIsbn, isFullIsbnQuery } from './book-search';
import { extractExplicitTocChapters } from './document-text-extractor';

export interface GoogleVolume {
  id?: string;
  volumeInfo?: {
    title?: string;
    authors?: string[];
    description?: string;
    publisher?: string;
    publishedDate?: string;
    pageCount?: number;
    categories?: string[];
    industryIdentifiers?: Array<{ type?: string; identifier?: string }>;
  };
  searchInfo?: {
    textSnippet?: string;
  };
}

export interface GoogleBooksResponse {
  items?: GoogleVolume[];
}

interface GoogleBooksSuggestion {
  title?: string;
  authors?: string[];
  description?: string;
  publisher?: string;
  year?: number | null;
  pages?: number | null;
  subjects?: string[];
  isbn?: string | null;
  googleBooksId?: string | null;
  chapters?: string[];
}

function normalizeGoogleBooksText(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function googleQuery(book: BookRecord): string {
  const isbn = isFullIsbnQuery(book.isbn ?? '')
    ? cleanedIsbn(book.isbn ?? '')
    : '';
  if (isbn) {
    return `isbn:${isbn}`;
  }
  const title = book.title.trim();
  const author = book.authors[0]?.trim() ?? '';
  return [title ? `intitle:${title}` : '', author ? `inauthor:${author}` : '']
    .filter(Boolean)
    .join('+');
}

function extractGoogleYear(value: string | undefined): number | null {
  const match = normalizeGoogleBooksText(value).match(
    /\b(1[5-9]\d{2}|20\d{2}|21\d{2})\b/,
  );
  return match ? Number(match[1]) : null;
}

function extractGoogleIsbn(volume: GoogleVolume): string | null {
  const identifiers = volume.volumeInfo?.industryIdentifiers ?? [];
  const preferred =
    identifiers.find((entry) => entry.type === 'ISBN_13') ??
    identifiers.find((entry) => entry.type === 'ISBN_10') ??
    identifiers[0];
  const normalized = cleanedIsbn(preferred?.identifier ?? '');
  if (!isFullIsbnQuery(normalized)) {
    return null;
  }
  return normalized || null;
}

function chapterCandidates(volume: GoogleVolume): string[] {
  const snippets = [
    volume.volumeInfo?.description ?? '',
    volume.searchInfo?.textSnippet ?? '',
  ]
    .map((value) => normalizeGoogleBooksText(value))
    .filter(Boolean);
  return snippets
    .flatMap((snippet) => extractExplicitTocChapters(snippet)?.chapters ?? [])
    .slice(0, 40);
}

export function googleBooksSuggestion(
  volume: GoogleVolume,
): GoogleBooksSuggestion {
  return {
    title: normalizeGoogleBooksText(volume.volumeInfo?.title),
    authors: (volume.volumeInfo?.authors ?? [])
      .map((author) => normalizeGoogleBooksText(author))
      .filter(Boolean),
    description: normalizeGoogleBooksText(
      volume.volumeInfo?.description || volume.searchInfo?.textSnippet,
    ),
    publisher: normalizeGoogleBooksText(volume.volumeInfo?.publisher),
    year: extractGoogleYear(volume.volumeInfo?.publishedDate),
    pages: volume.volumeInfo?.pageCount ?? null,
    subjects: (volume.volumeInfo?.categories ?? [])
      .map((category) => normalizeGoogleBooksText(category))
      .filter(Boolean),
    isbn: extractGoogleIsbn(volume),
    googleBooksId: volume.id ?? null,
    chapters: chapterCandidates(volume),
  };
}

export async function fetchGoogleBooksCandidates(
  fetchJson: <T>(url: string, signal?: AbortSignal) => Promise<T>,
  book: BookRecord,
  signal?: AbortSignal,
): Promise<GoogleBooksSuggestion[]> {
  const directVolume = book.googleBooksId
    ? fetchJson<GoogleVolume>(
        `https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(book.googleBooksId)}`,
        signal,
      )
        .then((volume) => [googleBooksSuggestion(volume)])
        .catch(() => [])
    : Promise.resolve([]);
  const query = googleQuery(book);
  if (!query) {
    return directVolume;
  }
  const [direct, payload] = await Promise.all([
    directVolume,
    fetchJson<GoogleBooksResponse>(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=5`,
      signal,
    ).catch(() => ({ items: [] })),
  ]);
  const seen = new Set<string>();
  return [...direct, ...(payload.items ?? []).map(googleBooksSuggestion)]
    .filter((candidate) =>
      Boolean(
        candidate.title || candidate.description || candidate.chapters?.length,
      ),
    )
    .filter((candidate) => {
      const key =
        candidate.googleBooksId || `${candidate.title}::${candidate.isbn}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
