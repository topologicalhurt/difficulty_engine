import type { BookRecord } from './types';

export interface CorpusBook extends BookRecord {
  chapterProfiles: ChapterProfile[];
  topicProfiles: ChapterProfile[];
  subjectTexts: string[];
  wordCounts: Record<string, number>;
  phraseCounts: Record<string, number>;
  totalWords: number;
  uniqueWords: number;
  lexicalDensity: number;
  sequence: {
    index: number | null;
    key: string;
  };
  seedEstimate: number;
  focusTokenCounts: Record<string, number>;
  cueProfile: {
    intro: number;
    advanced: number;
    bridge: number;
  };
}

export interface ChapterProfile {
  idx: number;
  title: string;
  words: string[];
  phrases: string[];
}

export interface CorpusSnapshot {
  books: CorpusBook[];
  byId: Record<string, CorpusBook>;
  docFreq: Record<string, number>;
  phraseDf: Record<string, number>;
  docCount: number;
  pageMedian: number;
}

export interface TopicCandidate {
  phrase: string;
  tf: number;
  rarity: number;
  score: number;
}

export interface TopicCoverageEntry {
  bookId: string;
  weight: number;
  chapterIdxs: number[];
}

export interface InternalTopicNode {
  id: string;
  label: string;
  sourcePhrases: string[];
  rarityScores: number[];
  coverage: TopicCoverageEntry[];
  chapterAnchors: Array<{ bookId: string; idx: number }>;
  complexityMetrics: {
    rarity: number;
    breadth: number;
    chapterSpread: number;
  };
  learnedComplexity: number;
}

export interface TopicIndex {
  topicsById: Record<string, InternalTopicNode>;
  byBook: Record<string, TopicCandidate[]>;
  bookStats: Record<
    string,
    {
      topicCount: number;
      weightedRarity: number;
      lexicalDensity: number;
      baseComplexity: number;
      topicWeights: Record<string, number>;
    }
  >;
}
