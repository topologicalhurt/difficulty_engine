import {
  CO_STUDY_OVERLAP_THRESHOLD,
  CO_STUDY_SCORE_THRESHOLD,
  PREREQ_SCORE_MARGIN,
  PREREQ_SCORE_THRESHOLD,
  REFERENCE_CONFIDENCE_MULTIPLIER,
  REFERENCE_SCORE_THRESHOLD,
  RELATION_CONFIDENCE_PRIMARY_WEIGHT,
  RELATION_CONFIDENCE_SECONDARY_WEIGHT,
} from './constants';
import type { CorpusSnapshot, PairSignal, TopicIndex } from './internal-types';
import { relationPairKey } from './relation-graph-utils';
import { relationPairIndexes } from './relation-pair-index';
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
