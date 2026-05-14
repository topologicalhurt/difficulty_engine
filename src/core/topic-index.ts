import {
  BOOK_COMPLEXITY_BREADTH_DIVISOR,
  BOOK_COMPLEXITY_BREADTH_WEIGHT,
  BOOK_COMPLEXITY_LEXICAL_MULTIPLIER,
  BOOK_COMPLEXITY_LEXICAL_WEIGHT,
  BOOK_COMPLEXITY_RARITY_WEIGHT,
  BOOK_COMPLEXITY_SEED_WEIGHT,
  MAX_TOPIC_CANDIDATES_PER_BOOK,
  TOPIC_COMPLEXITY_BASE,
  TOPIC_COMPLEXITY_BREADTH_WEIGHT,
  TOPIC_COMPLEXITY_CHAPTER_SPREAD_WEIGHT,
  TOPIC_COMPLEXITY_RARITY_WEIGHT,
} from './constants';
import type {
  CorpusSnapshot,
  InternalTopicNode,
  TopicCandidate,
  TopicIndex,
} from './internal-types';
import { clamp, mean, round1, round2, sum, unique } from './utils';

export function buildTopicIndexForCorpus(corpus: CorpusSnapshot): TopicIndex {
  const topicsById: Record<string, InternalTopicNode> = {};
  const byBook: Record<string, TopicCandidate[]> = {};
  const bookStats: TopicIndex['bookStats'] = {};

  Object.values(corpus.byId).forEach((book) => {
    const ranked = Object.entries(book.phraseCounts)
      .map(([phrase, tf]) => {
        const rarity = Math.log(
          1 + corpus.docCount / Math.max(1, corpus.phraseDf[phrase] || 1),
        );
        const score =
          tf * rarity * (1 + Math.min(1, phrase.split(' ').length * 0.18));
        return { phrase, tf, rarity, score };
      })
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.phrase.length - left.phrase.length ||
          left.phrase.localeCompare(right.phrase),
      )
      .slice(0, MAX_TOPIC_CANDIDATES_PER_BOOK);

    byBook[book.id] = ranked;
    const weights: Record<string, number> = {};

    ranked.forEach((topic) => {
      weights[topic.phrase] = topic.score;
      if (!topicsById[topic.phrase]) {
        topicsById[topic.phrase] = {
          id: topic.phrase,
          label: topic.phrase,
          sourcePhrases: [],
          rarityScores: [],
          coverage: [],
          chapterAnchors: [],
          complexityMetrics: { rarity: 0, breadth: 0, chapterSpread: 0 },
          learnedComplexity: 0,
        };
      }
      const current = topicsById[topic.phrase];
      current.sourcePhrases = unique([...current.sourcePhrases, topic.phrase]);
      current.rarityScores.push(topic.rarity);
      const structuralProfiles = book.chapterProfiles.concat(
        book.topicProfiles.map((profile) => ({
          ...profile,
          idx: book.chapterProfiles.length + profile.idx,
        })),
      );
      const chapterIdxs = structuralProfiles
        .filter((chapter) => chapter.phrases.includes(topic.phrase))
        .map((chapter) => chapter.idx);
      current.coverage.push({
        bookId: book.id,
        weight: topic.score,
        chapterIdxs,
      });
      if (chapterIdxs.length) {
        current.chapterAnchors.push(
          ...chapterIdxs.map((idx) => ({ bookId: book.id, idx })),
        );
      }
    });

    const weightedRarity =
      sum(ranked.map((topic) => topic.score * topic.rarity)) /
      Math.max(1, sum(ranked.map((topic) => topic.score)));
    const breadth = ranked.length;
    const complexity = clamp(
      TOPIC_COMPLEXITY_BASE +
        book.seedEstimate * BOOK_COMPLEXITY_SEED_WEIGHT +
        weightedRarity * BOOK_COMPLEXITY_RARITY_WEIGHT +
        clamp(breadth / BOOK_COMPLEXITY_BREADTH_DIVISOR, 0, 1) *
          BOOK_COMPLEXITY_BREADTH_WEIGHT +
        clamp(book.lexicalDensity * BOOK_COMPLEXITY_LEXICAL_MULTIPLIER, 0, 1) *
          BOOK_COMPLEXITY_LEXICAL_WEIGHT,
      1,
      10,
    );

    bookStats[book.id] = {
      topicCount: breadth,
      weightedRarity,
      lexicalDensity: book.lexicalDensity,
      baseComplexity: round1(complexity),
      topicWeights: weights,
    };
  });

  Object.values(topicsById).forEach((topic) => {
    const rarity = mean(topic.rarityScores);
    const breadth = topic.coverage.length;
    const chapterSpread = unique(
      topic.chapterAnchors.map((anchor) => `${anchor.bookId}:${anchor.idx}`),
    ).length;
    topic.complexityMetrics = {
      rarity: round2(rarity),
      breadth,
      chapterSpread,
    };
    topic.learnedComplexity = round1(
      clamp(
        TOPIC_COMPLEXITY_BASE +
          rarity * TOPIC_COMPLEXITY_RARITY_WEIGHT +
          clamp(breadth / 6, 0, 1) * TOPIC_COMPLEXITY_BREADTH_WEIGHT +
          clamp(chapterSpread / 8, 0, 1) *
            TOPIC_COMPLEXITY_CHAPTER_SPREAD_WEIGHT,
        1,
        10,
      ),
    );
  });

  return { topicsById, byBook, bookStats };
}
