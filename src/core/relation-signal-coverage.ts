import {
  FOCUS_WEIGHT_BASE,
  PHRASE_WEIGHT_BASE,
  TOKEN_WEIGHT_BASE,
  TOPIC_MATCH_SIMILARITY,
} from './constants';
import type { CorpusBook, CorpusSnapshot, TopicIndex } from './internal-types';
import { textSimilarity, weightedCoverage } from './text';
import { clamp } from './utils';

export interface CoverageSignal {
  sharedWeight: number;
  phraseCoverageAB: number;
  phraseCoverageBA: number;
  tokenCoverageAB: number;
  tokenCoverageBA: number;
  focusCoverageAB: number;
  focusCoverageBA: number;
  coverageAB: number;
  coverageBA: number;
  overlap: number;
  symmetry: number;
  matchedTopics: Array<{ a: string; b: string | null; sim: number; weight: number }>;
}

function coverageSymmetry(coverageAB: number, coverageBA: number): number {
  return 1 - Math.min(1, Math.abs(coverageAB - coverageBA));
}

export function buildCoverageSignal(
  left: CorpusBook,
  right: CorpusBook,
  topicIndex: TopicIndex,
  corpus: CorpusSnapshot,
): CoverageSignal | null {
  const leftWeights = topicIndex.bookStats[left.id]?.topicWeights || {};
  const rightWeights = topicIndex.bookStats[right.id]?.topicWeights || {};
  const leftKeys = Object.keys(leftWeights);
  const rightKeys = Object.keys(rightWeights);
  if (!leftKeys.length || !rightKeys.length) return null;

  let sharedWeight = 0;
  const matchedTopics: CoverageSignal['matchedTopics'] = [];
  leftKeys.forEach((topic) => {
    const best = rightKeys.reduce(
      (currentBest, key) => {
        const similarity = textSimilarity(topic, key);
        return similarity > currentBest.sim ? { key, sim: similarity } : currentBest;
      },
      { key: null as string | null, sim: 0 },
    );
    if (best.sim >= TOPIC_MATCH_SIMILARITY && best.key) {
      const weight = Math.min(leftWeights[topic] || 0, rightWeights[best.key] || 0) * best.sim;
      sharedWeight += weight;
      matchedTopics.push({ a: topic, b: best.key, sim: best.sim, weight });
    }
  });

  const totalLeft = Object.values(leftWeights).reduce((total, value) => total + value, 0);
  const totalRight = Object.values(rightWeights).reduce((total, value) => total + value, 0);
  const phraseCoverageAB = sharedWeight / Math.max(1, totalLeft);
  const phraseCoverageBA = sharedWeight / Math.max(1, totalRight);
  const tokenCoverageAB = weightedCoverage(left.wordCounts, right.wordCounts, corpus.docFreq, corpus.docCount);
  const tokenCoverageBA = weightedCoverage(right.wordCounts, left.wordCounts, corpus.docFreq, corpus.docCount);
  const focusCoverageAB = weightedCoverage(left.focusTokenCounts, right.focusTokenCounts, corpus.docFreq, corpus.docCount);
  const focusCoverageBA = weightedCoverage(right.focusTokenCounts, left.focusTokenCounts, corpus.docFreq, corpus.docCount);
  const coverageAB = clamp(
    phraseCoverageAB * PHRASE_WEIGHT_BASE +
      tokenCoverageAB * TOKEN_WEIGHT_BASE +
      focusCoverageAB * FOCUS_WEIGHT_BASE,
    0,
    1,
  );
  const coverageBA = clamp(
    phraseCoverageBA * PHRASE_WEIGHT_BASE +
      tokenCoverageBA * TOKEN_WEIGHT_BASE +
      focusCoverageBA * FOCUS_WEIGHT_BASE,
    0,
    1,
  );

  return {
    sharedWeight,
    phraseCoverageAB,
    phraseCoverageBA,
    tokenCoverageAB,
    tokenCoverageBA,
    focusCoverageAB,
    focusCoverageBA,
    coverageAB,
    coverageBA,
    overlap: (coverageAB + coverageBA) / 2,
    symmetry: coverageSymmetry(coverageAB, coverageBA),
    matchedTopics,
  };
}
