import {
  CO_STUDY_OVERLAP_THRESHOLD,
  CO_STUDY_SCORE_THRESHOLD,
  PREREQ_SCORE_MARGIN,
  PREREQ_SCORE_THRESHOLD,
  REFERENCE_CONFIDENCE_MULTIPLIER,
  REFERENCE_SCORE_THRESHOLD,
  MAX_EXHAUSTIVE_RELATION_BOOKS,
  MAX_INDEXED_RELATION_CANDIDATES_PER_BOOK,
  MAX_RELATION_INDEX_TOPIC_FREQUENCY,
  RELATION_CONFIDENCE_PRIMARY_WEIGHT,
  RELATION_CONFIDENCE_SECONDARY_WEIGHT,
} from './constants';
import type { CorpusSnapshot, PairSignal, TopicIndex } from './internal-types';
import { relationPairKey } from './relation-graph-utils';
import { pairSignal } from './relation-signals';
import type { RelationEvidence } from './types';
import { clamp, round2 } from './utils';

export interface LearnedRelationCandidates {
  byPair: Record<string, PairSignal>;
  candidates: RelationEvidence[];
}

export function learnedRelationCandidates(
  corpus: CorpusSnapshot,
  topicIndex: TopicIndex,
  requiredPairKeys: Set<string> = new Set(),
): LearnedRelationCandidates {
  const byPair: Record<string, PairSignal> = {};
  const candidates: RelationEvidence[] = [];
  const books = corpus.books;
  const pairIndexes = relationPairIndexes(books, topicIndex, requiredPairKeys);

  for (const [leftIndex, rightIndex] of pairIndexes) {
    const left = books[leftIndex];
    const right = books[rightIndex];
    const signal = pairSignal(left, right, topicIndex, corpus);
    byPair[relationPairKey(left.id, right.id)] = signal;
    const relation = candidateFromSignal(
      left.id,
      left.short,
      right.id,
      right.short,
      signal,
    );
    if (relation) candidates.push(relation);
  }

  return { byPair, candidates };
}

function relationPairIndexes(
  books: CorpusSnapshot['books'],
  topicIndex: TopicIndex,
  requiredPairKeys: Set<string>,
): Array<[number, number]> {
  if (books.length <= MAX_EXHAUSTIVE_RELATION_BOOKS) {
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i < books.length; i += 1) {
      for (let j = i + 1; j < books.length; j += 1) {
        pairs.push([i, j]);
      }
    }
    return pairs;
  }

  const indexById = new Map(books.map((book, index) => [book.id, index]));
  const pairScores = new Map<string, number>();
  const topicToBookIds = new Map<string, string[]>();
  books.forEach((book) => {
    (topicIndex.byBook[book.id] ?? []).forEach((topic) => {
      const ids = topicToBookIds.get(topic.phrase) ?? [];
      ids.push(book.id);
      topicToBookIds.set(topic.phrase, ids);
    });
  });

  topicToBookIds.forEach((ids) => {
    const sortedIds = [...new Set(ids)].sort();
    if (sortedIds.length > MAX_RELATION_INDEX_TOPIC_FREQUENCY) return;
    for (let left = 0; left < sortedIds.length; left += 1) {
      for (let right = left + 1; right < sortedIds.length; right += 1) {
        const key = relationPairKey(sortedIds[left], sortedIds[right]);
        pairScores.set(key, (pairScores.get(key) ?? 0) + 1);
      }
    }
  });

  const cappedPairKeys = cappedIndexedPairKeys(pairScores, requiredPairKeys);

  return cappedPairKeys
    .map((key): [number, number] | null => {
      const [leftId, rightId] = key.split('|');
      const leftIndex = indexById.get(leftId);
      const rightIndex = indexById.get(rightId);
      if (leftIndex == null || rightIndex == null || leftIndex === rightIndex) {
        return null;
      }
      return leftIndex < rightIndex
        ? [leftIndex, rightIndex]
        : [rightIndex, leftIndex];
    })
    .filter((pair): pair is [number, number] => Boolean(pair))
    .sort(
      ([leftA, rightA], [leftB, rightB]) =>
        leftA - leftB || rightA - rightB,
    );
}

function cappedIndexedPairKeys(
  pairScores: Map<string, number>,
  requiredPairKeys: Set<string>,
): string[] {
  const countsByBook = new Map<string, number>();
  const selected = new Set<string>(requiredPairKeys);
  requiredPairKeys.forEach((key) => {
    key.split('|').forEach((id) => {
      countsByBook.set(id, (countsByBook.get(id) ?? 0) + 1);
    });
  });

  [...pairScores.entries()]
    .sort(
      ([leftKey, leftScore], [rightKey, rightScore]) =>
        rightScore - leftScore || leftKey.localeCompare(rightKey),
    )
    .forEach(([key]) => {
      if (selected.has(key)) return;
      const [leftId, rightId] = key.split('|');
      const leftCount = countsByBook.get(leftId) ?? 0;
      const rightCount = countsByBook.get(rightId) ?? 0;
      if (
        leftCount >= MAX_INDEXED_RELATION_CANDIDATES_PER_BOOK ||
        rightCount >= MAX_INDEXED_RELATION_CANDIDATES_PER_BOOK
      ) {
        return;
      }
      selected.add(key);
      countsByBook.set(leftId, leftCount + 1);
      countsByBook.set(rightId, rightCount + 1);
    });

  return [...selected].sort();
}

function candidateFromSignal(
  leftId: string,
  leftShort: string,
  rightId: string,
  rightShort: string,
  signal: PairSignal,
): RelationEvidence | null {
  if (
    signal.prereqAB >= PREREQ_SCORE_THRESHOLD &&
    signal.prereqAB >= signal.prereqBA + PREREQ_SCORE_MARGIN
  ) {
    return {
      from: leftId,
      to: rightId,
      type: 'prerequisite',
      score: signal.prereqAB,
      confidence: round2(
        clamp(
          signal.prereqAB * RELATION_CONFIDENCE_PRIMARY_WEIGHT +
            signal.coverageAB * RELATION_CONFIDENCE_SECONDARY_WEIGHT,
          0,
          1,
        ),
      ),
      symmetry: signal.symmetry,
      reasons: signal.reasonsAB.length
        ? signal.reasonsAB
        : ['graph consistency'],
      sources: ['corpus', 'metadata'],
      explanation: `${leftShort} appears to prepare material that ${rightShort} expands on.`,
    };
  }
  if (
    signal.prereqBA >= PREREQ_SCORE_THRESHOLD &&
    signal.prereqBA >= signal.prereqAB + PREREQ_SCORE_MARGIN
  ) {
    return {
      from: rightId,
      to: leftId,
      type: 'prerequisite',
      score: signal.prereqBA,
      confidence: round2(
        clamp(
          signal.prereqBA * RELATION_CONFIDENCE_PRIMARY_WEIGHT +
            signal.coverageBA * RELATION_CONFIDENCE_SECONDARY_WEIGHT,
          0,
          1,
        ),
      ),
      symmetry: signal.symmetry,
      reasons: signal.reasonsBA.length
        ? signal.reasonsBA
        : ['graph consistency'],
      sources: ['corpus', 'metadata'],
      explanation: `${rightShort} appears to prepare material that ${leftShort} expands on.`,
    };
  }
  if (
    signal.coStudyScore >= CO_STUDY_SCORE_THRESHOLD &&
    signal.overlap >= CO_STUDY_OVERLAP_THRESHOLD
  ) {
    return {
      from: leftId,
      to: rightId,
      type: 'co-study',
      score: signal.coStudyScore,
      confidence: round2(signal.coStudyScore),
      symmetry: signal.symmetry,
      reasons: ['strong symmetric overlap'],
      sources: ['corpus'],
      explanation: `${leftShort} and ${rightShort} share strong symmetric overlap and can study in parallel.`,
    };
  }
  if (signal.reference >= REFERENCE_SCORE_THRESHOLD) {
    return {
      from: leftId,
      to: rightId,
      type: 'reference',
      score: signal.reference,
      confidence: round2(signal.reference * REFERENCE_CONFIDENCE_MULTIPLIER),
      symmetry: signal.symmetry,
      reasons: ['shared topic reference'],
      sources: ['corpus'],
      explanation: `${leftShort} and ${rightShort} reference similar topic territory.`,
    };
  }
  return null;
}
