import { corpusBookFromRecord } from './corpus-book-extract';
import type { CorpusSnapshot, TopicIndex } from './internal-types';
import { buildTopicIndexForCorpus } from './topic-index';
import type { BookRecord, PlannerProjectV1 } from './types';
import { tokenizeWords } from './text';
import { asArray, unique } from './utils';
import { readingScopeSettingsForProject } from './reading-scope';

export function displayGroupFromBooks(
  book: Pick<BookRecord, 'title' | 'subjects' | 'publisher'>,
  existingBooks: BookRecord[],
  knownGroups: string[],
): string {
  const groups = unique(
    knownGroups.map((group) => String(group || '').trim()).filter(Boolean),
  );
  if (!groups.length) return 'Core';
  const terms = new Set(
    tokenizeWords(
      [book.title, asArray(book.subjects).join(' '), book.publisher].join(' '),
    ),
  );
  if (!terms.size) return groups[0];

  const scores: Record<string, number> = {};
  groups.forEach((group) => {
    scores[group] = 0;
  });

  existingBooks.forEach((other) => {
    const group = String(other.displayGroup || '').trim();
    if (!Object.prototype.hasOwnProperty.call(scores, group)) return;
    const otherTerms = new Set(
      tokenizeWords(
        [other.title, asArray(other.subjects).join(' '), other.publisher].join(
          ' ',
        ),
      ),
    );
    let shared = 0;
    terms.forEach((term) => {
      if (otherTerms.has(term)) shared += 1;
    });
    const similarity =
      shared / Math.max(1, terms.size + otherTerms.size - shared);
    scores[group] += similarity;
  });

  const ranked = Object.entries(scores).sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  );
  if (ranked[0] && ranked[0][1] > 0) return ranked[0][0];

  const counts: Record<string, number> = {};
  groups.forEach((group) => {
    counts[group] = 0;
  });
  existingBooks.forEach((other) => {
    counts[other.displayGroup] = (counts[other.displayGroup] || 0) + 1;
  });

  return (
    groups.sort(
      (left, right) =>
        (counts[left] || 0) - (counts[right] || 0) || left.localeCompare(right),
    )[0] || groups[0]
  );
}

export function extractCorpus(project: PlannerProjectV1): CorpusSnapshot {
  const readingScopeSettings = readingScopeSettingsForProject(project);
  const books = Object.entries(project.library.books).map(([id, book]) =>
    corpusBookFromRecord(id, book, readingScopeSettings),
  );

  const docFreq: Record<string, number> = {};
  const phraseDf: Record<string, number> = {};
  books.forEach((book) => {
    Object.keys(book.wordCounts).forEach((word) => {
      docFreq[word] = (docFreq[word] || 0) + 1;
    });
    Object.keys(book.phraseCounts).forEach((phrase) => {
      phraseDf[phrase] = (phraseDf[phrase] || 0) + 1;
    });
  });

  const byId = Object.fromEntries(books.map((book) => [book.id, book]));
  const sortedPages = books
    .map((book) => book.pages)
    .sort((left, right) => left - right);
  const mid = Math.floor(sortedPages.length / 2);
  const pageMedian = sortedPages.length
    ? sortedPages.length % 2
      ? sortedPages[mid] || 300
      : ((sortedPages[mid - 1] || 300) + (sortedPages[mid] || 300)) / 2
    : 300;

  return {
    books,
    byId,
    docFreq,
    phraseDf,
    docCount: Math.max(1, books.length),
    pageMedian,
  };
}

export function buildTopicIndex(corpus: CorpusSnapshot): TopicIndex {
  return buildTopicIndexForCorpus(corpus);
}
