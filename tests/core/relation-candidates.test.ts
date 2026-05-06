import { describe, expect, it } from 'vitest';

import { learnedRelationCandidates } from '../../src/core/relation-candidates';
import { relationPairKey } from '../../src/core/relation-graph-utils';
import type {
  CorpusBook,
  CorpusSnapshot,
  TopicCandidate,
  TopicIndex,
} from '../../src/core/internal-types';

function corpusBook(
  id: string,
  title: string,
  phrase: string,
  order: number,
): CorpusBook {
  const words = phrase.split(/\s+/);
  const wordCounts = Object.fromEntries(words.map((word) => [word, 1]));
  return {
    id,
    title,
    short: title,
    authors: ['Author'],
    displayGroup: 'Test',
    manualSeedDifficulty: 5,
    pages: 100,
    subjects: [phrase],
    publisher: '',
    isbn: null,
    year: null,
    manualPrereqs: [],
    manualCoStudy: [],
    owned: true,
    planOrder: order,
    allowPrereqOverlap: false,
    lockDiff: false,
    noPropOut: false,
    ignored: false,
    constantRD: false,
    completed: false,
    enrichment: {
      chapters: [phrase],
      description: phrase,
      olSubjects: [phrase],
      tocSource: 'manual',
    },
    chapterProfiles: [{ idx: 0, title: phrase, words, phrases: [phrase] }],
    subjectTexts: [phrase],
    wordCounts,
    phraseCounts: { [phrase]: 1 },
    totalWords: words.length,
    uniqueWords: words.length,
    lexicalDensity: 1,
    sequence: { index: null, key: title },
    seedEstimate: 5,
    focusTokenCounts: wordCounts,
    cueProfile: { intro: 0, advanced: 0, bridge: 0 },
  };
}

function topicCandidate(phrase: string): TopicCandidate {
  return { phrase, tf: 1, rarity: 1, score: 1 };
}

function fixture(): { corpus: CorpusSnapshot; topicIndex: TopicIndex } {
  const books = [
    corpusBook('linear-basic', 'Linear Algebra', 'linear algebra', 0),
    corpusBook(
      'linear-methods',
      'Linear Algebra Methods',
      'linear algebra methods',
      1,
    ),
    ...Array.from({ length: 79 }, (_, index) =>
      corpusBook(`filler-${index}`, `Filler ${index}`, `filler${index}`, index + 2),
    ),
  ];
  const byId = Object.fromEntries(books.map((book) => [book.id, book]));
  const byBook = Object.fromEntries(
    books.map((book) => [
      book.id,
      [topicCandidate(Object.keys(book.phraseCounts)[0] ?? book.id)],
    ]),
  );
  const bookStats = Object.fromEntries(
    books.map((book) => {
      const phrase = Object.keys(book.phraseCounts)[0] ?? book.id;
      return [
        book.id,
        {
          topicCount: 1,
          weightedRarity: 1,
          lexicalDensity: 1,
          baseComplexity: 5,
          topicWeights: { [phrase]: 1 },
        },
      ];
    }),
  );
  return {
    corpus: {
      books,
      byId,
      docFreq: { linear: 2, algebra: 2, methods: 1 },
      phraseDf: {},
      docCount: books.length,
      pageMedian: 100,
    },
    topicIndex: {
      topicsById: {},
      byBook,
      bookStats,
    },
  };
}

describe('learnedRelationCandidates', () => {
  it('keeps fuzzy topic-neighbor pairs in the indexed large-library path', () => {
    const { corpus, topicIndex } = fixture();

    const learned = learnedRelationCandidates(corpus, topicIndex);
    const signal =
      learned.byPair[relationPairKey('linear-basic', 'linear-methods')];

    expect(signal).toBeDefined();
    expect(signal?.matchedTopics?.[0]?.sim).toBeGreaterThanOrEqual(0.4);
  });
});
