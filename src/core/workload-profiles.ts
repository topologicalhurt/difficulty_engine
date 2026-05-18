import {
  WORKLOAD_LOW_METADATA_CONFIDENCE,
  WORKLOAD_SPECIALIZED_COMPLEXITY_FLOOR,
  WORKLOAD_SPECIALIZED_RARITY_FLOOR,
  WORKLOAD_SPECIALIZED_TOPIC_COUNT,
} from './constants';
import type {
  CorpusBook,
  CorpusSnapshot,
  RelationInfo,
  TopicIndex,
} from './internal-types';
import { topologicalDepth } from './relation-graph-utils';
import { clamp, mean, round2 } from './utils';
import {
  INITIAL_WORKLOAD_MODEL,
  METADATA_CONFIDENCE,
} from './workload-cluster-config';

// Workload profiles create local evidence cohorts for shrinkage and comparison.
// The graph depth term is intentionally small and heuristic: future changes
// should require independent same-topic/progressive-chain evidence before
// interpreting depth as difficulty rather than only order.
export interface WorkloadProfile {
  id: string;
  topicWeights: Record<string, number>;
  tokenWeights: Record<string, number>;
  initialWorkload: number;
  corpusComplexity: number;
  weightedRarity: number;
  topicCount: number;
  metadataConfidence: number;
  sparseSpecialized: boolean;
  evidenceSources: string[];
}

function provenanceConfidence(book: CorpusBook): number {
  const values = Object.values(book.enrichment.provenance || {})
    .map((entry) => entry?.confidence ?? 0)
    .filter((value) => value > 0);
  return mean(values);
}

function evidenceSources(book: CorpusBook): string[] {
  return [
    book.title ? 'title' : '',
    book.subjectTexts.length ? 'subjects' : '',
    book.enrichment.description.trim() ? 'description' : '',
    book.chapterProfiles.length ? 'chapters' : '',
    book.sourcePath || book.enrichment.tocSource === 'pdf'
      ? 'local document'
      : '',
    provenanceConfidence(book) ? 'enrichment provenance' : '',
  ].filter(Boolean);
}

function metadataConfidence(book: CorpusBook, topicCount: number): number {
  const descriptionWords = book.enrichment.description
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const titleSpecificity =
    Math.min(
      1,
      Object.keys(book.focusTokenCounts).length /
        METADATA_CONFIDENCE.titleTokenNormalizer,
    ) * METADATA_CONFIDENCE.titleWeight;
  const subjectScore =
    Math.min(
      1,
      book.subjectTexts.length / METADATA_CONFIDENCE.subjectNormalizer,
    ) * METADATA_CONFIDENCE.subjectWeight;
  const descriptionScore =
    Math.min(
      1,
      descriptionWords / METADATA_CONFIDENCE.descriptionWordNormalizer,
    ) * METADATA_CONFIDENCE.descriptionWeight;
  const chapterScore =
    Math.min(
      1,
      book.chapterProfiles.length / METADATA_CONFIDENCE.chapterNormalizer,
    ) * METADATA_CONFIDENCE.chapterWeight;
  const topicScore =
    Math.min(1, topicCount / METADATA_CONFIDENCE.topicNormalizer) *
    METADATA_CONFIDENCE.topicWeight;
  const provenanceScore =
    provenanceConfidence(book) * METADATA_CONFIDENCE.provenanceWeight;
  const localSourceScore =
    book.sourcePath || book.enrichment.tocSource === 'pdf'
      ? METADATA_CONFIDENCE.localSourceWeight
      : 0;
  return round2(
    clamp(
      METADATA_CONFIDENCE.base +
        titleSpecificity +
        subjectScore +
        descriptionScore +
        chapterScore +
        topicScore +
        provenanceScore +
        localSourceScore,
      METADATA_CONFIDENCE.min,
      METADATA_CONFIDENCE.max,
    ),
  );
}

function initialWorkload(
  book: CorpusBook,
  topicIndex: TopicIndex,
  relationInfo: RelationInfo,
  depths: Record<string, number>,
  pageMedian: number,
): number {
  const stats = topicIndex.bookStats[book.id] || {
    baseComplexity: book.seedEstimate,
    weightedRarity: 0,
    topicCount: 0,
  };
  const pagePressure = clamp(
    Math.log2(book.pages / Math.max(1, pageMedian)),
    INITIAL_WORKLOAD_MODEL.pagePressureMin,
    INITIAL_WORKLOAD_MODEL.pagePressureMax,
  );
  const prereqCount = relationInfo.prereqById[book.id]?.length || 0;
  return round2(
    clamp(
      book.seedEstimate * INITIAL_WORKLOAD_MODEL.seedWeight +
        stats.baseComplexity * INITIAL_WORKLOAD_MODEL.complexityWeight +
        pagePressure * INITIAL_WORKLOAD_MODEL.pagePressureWeight +
        clamp(
          stats.topicCount / INITIAL_WORKLOAD_MODEL.topicCountNormalizer,
          0,
          1,
        ) *
          INITIAL_WORKLOAD_MODEL.topicCountWeight +
        clamp(
          stats.weightedRarity / INITIAL_WORKLOAD_MODEL.rarityNormalizer,
          0,
          1,
        ) *
          INITIAL_WORKLOAD_MODEL.rarityWeight +
        (depths[book.id] || 0) * INITIAL_WORKLOAD_MODEL.graphDepthWeight +
        prereqCount * INITIAL_WORKLOAD_MODEL.prerequisiteCountWeight,
      INITIAL_WORKLOAD_MODEL.min,
      INITIAL_WORKLOAD_MODEL.max,
    ),
  );
}

function buildProfile(
  book: CorpusBook,
  corpus: CorpusSnapshot,
  topicIndex: TopicIndex,
  relationInfo: RelationInfo,
  depths: Record<string, number>,
): WorkloadProfile {
  const stats = topicIndex.bookStats[book.id] || {
    baseComplexity: book.seedEstimate,
    weightedRarity: 0,
    topicCount: 0,
    topicWeights: {},
    lexicalDensity: book.lexicalDensity,
  };
  const confidence = metadataConfidence(book, stats.topicCount);
  const workload = initialWorkload(
    book,
    topicIndex,
    relationInfo,
    depths,
    corpus.pageMedian,
  );
  const sparseSpecialized =
    confidence < WORKLOAD_LOW_METADATA_CONFIDENCE &&
    stats.topicCount >= WORKLOAD_SPECIALIZED_TOPIC_COUNT &&
    (stats.baseComplexity >= WORKLOAD_SPECIALIZED_COMPLEXITY_FLOOR ||
      stats.weightedRarity >= WORKLOAD_SPECIALIZED_RARITY_FLOOR);
  return {
    id: book.id,
    topicWeights: stats.topicWeights || {},
    tokenWeights: book.focusTokenCounts,
    initialWorkload: workload,
    corpusComplexity: stats.baseComplexity,
    weightedRarity: stats.weightedRarity,
    topicCount: stats.topicCount,
    metadataConfidence: confidence,
    sparseSpecialized,
    evidenceSources: evidenceSources(book),
  };
}

export function buildWorkloadProfiles(
  corpus: CorpusSnapshot,
  topicIndex: TopicIndex,
  relationInfo: RelationInfo,
): WorkloadProfile[] {
  const depths = topologicalDepth(
    corpus.books.map((book) => book.id),
    relationInfo.prereqById,
  );
  return corpus.books.map((book) =>
    buildProfile(book, corpus, topicIndex, relationInfo, depths),
  );
}
