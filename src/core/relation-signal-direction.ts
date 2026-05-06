import type { CorpusBook, TopicIndex } from './internal-types';
import { parseSeriesInfo } from './text';
import { clamp, safeNumber } from './utils';
import {
  PROGRESSION_MODEL,
  RELATION_DIRECTION_MODEL,
  RELATION_REASON_THRESHOLDS,
} from './relation-signal-config';

export interface DirectionalSignal {
  seriesAB: number;
  seriesBA: number;
  complexityAB: number;
  complexityBA: number;
  seedAB: number;
  seedBA: number;
  pageAB: number;
  pageBA: number;
  progressionAB: number;
  progressionBA: number;
}

export function sameAuthor(left: CorpusBook, right: CorpusBook): boolean {
  return left.authors.some((author) =>
    right.authors.some(
      (other) => String(author).toLowerCase() === String(other).toLowerCase(),
    ),
  );
}

function seriesDirection(
  left: CorpusBook,
  right: CorpusBook,
): [number, number] {
  const leftSequence = parseSeriesInfo(left.title);
  const rightSequence = parseSeriesInfo(right.title);
  if (
    leftSequence.index == null ||
    rightSequence.index == null ||
    !leftSequence.key ||
    leftSequence.key !== rightSequence.key
  ) {
    return [0, 0];
  }
  return [
    leftSequence.index < rightSequence.index ? 1 : 0,
    rightSequence.index < leftSequence.index ? 1 : 0,
  ];
}

function progressionScore(
  introBook: CorpusBook,
  advancedBook: CorpusBook,
): number {
  return clamp(
    introBook.cueProfile.intro * PROGRESSION_MODEL.introWeight +
      advancedBook.cueProfile.advanced * PROGRESSION_MODEL.advancedWeight +
      advancedBook.cueProfile.bridge * PROGRESSION_MODEL.bridgeWeight +
      Math.max(
        0,
        advancedBook.cueProfile.advanced - introBook.cueProfile.advanced,
      ) *
        PROGRESSION_MODEL.advancedDeltaWeight +
      Math.max(0, introBook.cueProfile.intro - advancedBook.cueProfile.intro) *
        PROGRESSION_MODEL.introDeltaWeight,
    0,
    1,
  );
}

export function buildDirectionalSignal(
  left: CorpusBook,
  right: CorpusBook,
  topicIndex: TopicIndex,
): DirectionalSignal {
  const [seriesAB, seriesBA] = seriesDirection(left, right);
  const complexityLeft =
    topicIndex.bookStats[left.id]?.baseComplexity ||
    left.manualSeedDifficulty ||
    5;
  const complexityRight =
    topicIndex.bookStats[right.id]?.baseComplexity ||
    right.manualSeedDifficulty ||
    5;
  const seedLeft = safeNumber(
    left.manualSeedDifficulty,
    left.seedEstimate || 5,
  );
  const seedRight = safeNumber(
    right.manualSeedDifficulty,
    right.seedEstimate || 5,
  );

  return {
    seriesAB,
    seriesBA,
    complexityAB: clamp(
      (complexityRight -
        complexityLeft +
        RELATION_DIRECTION_MODEL.complexityOffset) /
        RELATION_DIRECTION_MODEL.complexityDivisor,
      0,
      1,
    ),
    complexityBA: clamp(
      (complexityLeft -
        complexityRight +
        RELATION_DIRECTION_MODEL.complexityOffset) /
        RELATION_DIRECTION_MODEL.complexityDivisor,
      0,
      1,
    ),
    seedAB: clamp(
      (seedRight - seedLeft + RELATION_DIRECTION_MODEL.seedOffset) /
        RELATION_DIRECTION_MODEL.seedDivisor,
      0,
      1,
    ),
    seedBA: clamp(
      (seedLeft - seedRight + RELATION_DIRECTION_MODEL.seedOffset) /
        RELATION_DIRECTION_MODEL.seedDivisor,
      0,
      1,
    ),
    pageAB: clamp(
      Math.log1p(right.pages) -
        Math.log1p(left.pages) +
        RELATION_DIRECTION_MODEL.pageOffset,
      0,
      1,
    ),
    pageBA: clamp(
      Math.log1p(left.pages) -
        Math.log1p(right.pages) +
        RELATION_DIRECTION_MODEL.pageOffset,
      0,
      1,
    ),
    progressionAB: progressionScore(left, right),
    progressionBA: progressionScore(right, left),
  };
}

export function directionalReasons(
  coverage: number,
  novelty: number,
  series: number,
  complexity: number,
  progression: number,
): string[] {
  const reasons: string[] = [];
  if (coverage >= RELATION_REASON_THRESHOLDS.coverage)
    reasons.push('topic coverage containment');
  if (novelty >= RELATION_REASON_THRESHOLDS.novelty)
    reasons.push('novel material expansion');
  if (series) reasons.push('series ordering');
  if (complexity >= RELATION_REASON_THRESHOLDS.complexity)
    reasons.push('structural progression');
  if (progression >= RELATION_REASON_THRESHOLDS.progression)
    reasons.push('generic progression cues');
  return reasons;
}
