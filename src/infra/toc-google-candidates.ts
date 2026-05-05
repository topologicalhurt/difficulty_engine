import { fetchGoogleBooksCandidates } from './google-books';
import type { StrategyContext } from './toc-strategy-context';
import type { StrategyCandidate } from './toc-merge';

export async function googleBooksCandidates(
  context: StrategyContext,
): Promise<StrategyCandidate[]> {
  const candidates = await fetchGoogleBooksCandidates(
    context.fetchJson,
    context.book,
    context.signal,
  );
  return candidates.map((candidate) => ({
    provider: 'google_books',
    sourceUrl: candidate.googleBooksId
      ? `https://books.google.com/books?id=${candidate.googleBooksId}`
      : 'https://books.google.com/',
    confidence: candidate.chapters?.length ? 0.68 : 0.58,
    chapters: candidate.chapters,
    description: candidate.description,
    subjects: candidate.subjects,
    pages: candidate.pages,
    publisher: candidate.publisher,
    year: candidate.year,
    authors: candidate.authors,
    isbn: candidate.isbn,
    googleBooksId: candidate.googleBooksId,
    tocSource: candidate.chapters?.length ? 'google_books' : 'none',
  }));
}
