import {
  CO_STUDY_WEIGHT_OVERLAP,
  CO_STUDY_WEIGHT_SAME_AUTHOR,
  CO_STUDY_WEIGHT_SYMMETRY,
  PREREQ_WEIGHT_COMPLEXITY,
  PREREQ_WEIGHT_COVERAGE,
  PREREQ_WEIGHT_NOVELTY,
  PREREQ_WEIGHT_PAGE,
  PREREQ_WEIGHT_PROGRESSION,
  PREREQ_WEIGHT_SAME_AUTHOR,
  PREREQ_WEIGHT_SEED,
  PREREQ_WEIGHT_SERIES,
  REFERENCE_WEIGHT_OVERLAP,
  REFERENCE_WEIGHT_PREREQ,
} from './constants';
import type {
  CorpusBook,
  CorpusSnapshot,
  PairSignal,
  TopicIndex,
} from './internal-types';
import { clamp } from './utils';
import { buildCoverageSignal } from './relation-signal-coverage';
import {
  buildDirectionalSignal,
  directionalReasons,
  sameAuthor,
} from './relation-signal-direction';

function emptyPairSignal(left: CorpusBook, right: CorpusBook): PairSignal {
  return {
    leftId: left.id,
    rightId: right.id,
    sharedWeight: 0,
    coverageAB: 0,
    coverageBA: 0,
    overlap: 0,
    coStudyScore: 0,
    prereqAB: 0,
    prereqBA: 0,
    reasonsAB: [],
    reasonsBA: [],
    reference: 0,
    symmetry: 0,
  };
}

function prerequisiteScore(input: {
  coverage: number;
  novelty: number;
  complexity: number;
  seed: number;
  page: number;
  series: number;
  progression: number;
  authorMatch: boolean;
}): number {
  return clamp(
    input.coverage * PREREQ_WEIGHT_COVERAGE +
      input.novelty * PREREQ_WEIGHT_NOVELTY +
      input.complexity * PREREQ_WEIGHT_COMPLEXITY +
      input.seed * PREREQ_WEIGHT_SEED +
      input.page * PREREQ_WEIGHT_PAGE +
      input.series * PREREQ_WEIGHT_SERIES +
      input.progression * PREREQ_WEIGHT_PROGRESSION +
      (input.authorMatch ? PREREQ_WEIGHT_SAME_AUTHOR : 0),
    0,
    1,
  );
}

function coStudyScore(
  overlap: number,
  symmetry: number,
  authorMatch: boolean,
): number {
  return clamp(
    overlap * CO_STUDY_WEIGHT_OVERLAP +
      symmetry * CO_STUDY_WEIGHT_SYMMETRY +
      (authorMatch ? CO_STUDY_WEIGHT_SAME_AUTHOR : 0),
    0,
    1,
  );
}

function referenceScore(
  overlap: number,
  prereqAB: number,
  prereqBA: number,
): number {
  return clamp(
    overlap * REFERENCE_WEIGHT_OVERLAP +
      Math.max(prereqAB, prereqBA) * REFERENCE_WEIGHT_PREREQ,
    0,
    1,
  );
}

export function pairSignal(
  left: CorpusBook,
  right: CorpusBook,
  topicIndex: TopicIndex,
  corpus: CorpusSnapshot,
): PairSignal {
  const coverage = buildCoverageSignal(left, right, topicIndex, corpus);
  if (!coverage) return emptyPairSignal(left, right);

  const direction = buildDirectionalSignal(left, right, topicIndex);
  const authorMatch = sameAuthor(left, right);
  const noveltyAB = clamp(1 - coverage.coverageBA, 0, 1);
  const noveltyBA = clamp(1 - coverage.coverageAB, 0, 1);
  const prereqAB = prerequisiteScore({
    coverage: coverage.coverageAB,
    novelty: noveltyAB,
    complexity: direction.complexityAB,
    seed: direction.seedAB,
    page: direction.pageAB,
    series: direction.seriesAB,
    progression: direction.progressionAB,
    authorMatch,
  });
  const prereqBA = prerequisiteScore({
    coverage: coverage.coverageBA,
    novelty: noveltyBA,
    complexity: direction.complexityBA,
    seed: direction.seedBA,
    page: direction.pageBA,
    series: direction.seriesBA,
    progression: direction.progressionBA,
    authorMatch,
  });

  return {
    leftId: left.id,
    rightId: right.id,
    ...coverage,
    coStudyScore: coStudyScore(
      coverage.overlap,
      coverage.symmetry,
      authorMatch,
    ),
    prereqAB,
    prereqBA,
    progressionAB: direction.progressionAB,
    progressionBA: direction.progressionBA,
    reasonsAB: directionalReasons(
      coverage.coverageAB,
      noveltyAB,
      direction.seriesAB,
      direction.complexityAB,
      direction.progressionAB,
    ),
    reasonsBA: directionalReasons(
      coverage.coverageBA,
      noveltyBA,
      direction.seriesBA,
      direction.complexityBA,
      direction.progressionBA,
    ),
    reference: referenceScore(coverage.overlap, prereqAB, prereqBA),
    sameAuthor: authorMatch,
  };
}
