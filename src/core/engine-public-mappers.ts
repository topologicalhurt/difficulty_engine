import type { buildTopicIndex, extractCorpus } from './corpus';
import type { computeDifficultyModel } from './difficulty';
import type { buildOverlapClusters } from './overlap-clusters';
import type { buildWorkloadClusters } from './workload-clusters';
import type {
  DifficultyBreakdown,
  EngineSnapshot,
  OverlapClusterSummary,
  PlannerProjectV1,
  TopicNode,
  WorkloadClusterSummary,
} from './types';
import { round2 } from './utils';

export function toPublicTopics(snapshot: ReturnType<typeof buildTopicIndex>): {
  topics: TopicNode[];
  topicsById: Record<string, TopicNode>;
} {
  const topics = Object.values(snapshot.topicsById)
    .map<TopicNode>((topic) => ({
      id: topic.id,
      label: topic.label,
      sourcePhrases: [...topic.sourcePhrases],
      rarityCoverage: {
        rarity: topic.complexityMetrics.rarity,
        breadth: topic.complexityMetrics.breadth,
        chapterSpread: topic.complexityMetrics.chapterSpread,
      },
      chapterAnchors: [...topic.chapterAnchors],
      learnedComplexity: topic.learnedComplexity,
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
  return {
    topics,
    topicsById: Object.fromEntries(topics.map((topic) => [topic.id, topic])),
  };
}

export function toPublicDifficulty(
  difficultyModel: ReturnType<typeof computeDifficultyModel>,
): Record<string, DifficultyBreakdown> {
  return Object.fromEntries(
    Object.entries(difficultyModel.byId).map(([id, entry]) => [
      id,
      {
        seed: entry.seed,
        corpusComplexity: entry.corpusComplexity,
        latentWorkload: entry.latentWorkload,
        workloadUncertainty: entry.workloadUncertainty,
        evidenceConfidence: entry.evidenceConfidence,
        subjectWorkloadPrior: entry.subjectWorkloadPrior,
        subjectWorkloadLift: entry.subjectWorkloadLift,
        subjectClusterId: entry.subjectClusterId,
        subjectClusterConfidence: entry.subjectClusterConfidence,
        metadataConfidence: entry.metadataConfidence,
        physicalPages: entry.physicalPages,
        effectiveReadingPages: entry.effectiveReadingPages,
        skippedReadingPages: entry.skippedReadingPages,
        readingScopeConfidence: entry.readingScopeConfidence,
        readingScopeReason: entry.readingScopeReason,
        graphBurden: entry.graphBurden,
        graphWorkloadLift: entry.graphWorkloadLift,
        learnerCalibrationLift: entry.learnerCalibrationLift,
        profileAdjustedDifficulty: entry.profileAdjustedDifficulty,
        difficultyBindingReason: entry.difficultyBindingReason,
        difficultyEvidence: [...entry.difficultyEvidence],
        novelty: entry.noveltyLoad,
        breadth: entry.breadthLoad,
        retention: entry.retentionLoad,
        scheduleDifficulty: entry.scheduleDifficulty,
        displayDifficulty: entry.displayDifficulty,
        explanation: [...entry.explanation],
      },
    ]),
  );
}

export function toPublicWorkloadClusters(
  clusters: ReturnType<typeof buildWorkloadClusters>['clusters'],
): WorkloadClusterSummary[] {
  return clusters.map((cluster) => ({
    id: cluster.id,
    label: cluster.label,
    bookIds: [...cluster.bookIds],
    topPhrases: [...cluster.topPhrases],
    workloadPrior: cluster.workloadPrior,
    confidence: cluster.confidence,
    evidenceSources: [...cluster.evidenceSources],
    assignments: cluster.assignments.map((assignment) => ({
      bookId: assignment.bookId,
      metadataConfidence: assignment.metadataConfidence,
      subjectWorkloadPrior: assignment.subjectWorkloadPrior,
      similarityToCluster: assignment.similarityToCluster,
      nearestBookIds: [...assignment.nearestBookIds],
      sparseSpecialized: assignment.sparseSpecialized,
      shrinkageApplied: assignment.shrinkageApplied,
      explanation: assignment.explanation,
    })),
  }));
}

export function buildSortedBooks(
  project: PlannerProjectV1,
  corpus: ReturnType<typeof extractCorpus>,
  difficultyModel: ReturnType<typeof computeDifficultyModel>,
): EngineSnapshot['sortedBooks'] {
  return Object.values(project.library.books)
    .map((book) => {
      const difficulty = difficultyModel.byId[book.id];
      return {
        ...book,
        abs: difficulty?.corpusComplexity ?? book.manualSeedDifficulty,
        rel: difficulty?.scheduleDifficulty ?? book.manualSeedDifficulty,
        eff:
          difficulty?.displayDifficulty ??
          difficulty?.scheduleDifficulty ??
          book.manualSeedDifficulty,
        timeEff: difficulty?.scheduleDifficulty ?? book.manualSeedDifficulty,
        dep: difficulty?.topologicalDepth ?? 0,
      };
    })
    .sort(
      (left, right) =>
        right.eff - left.eff ||
        left.short.localeCompare(right.short) ||
        corpus.byId[left.id].title.localeCompare(corpus.byId[right.id].title),
    );
}

export function buildSchedById(
  schedulePlan: EngineSnapshot['schedulePlan'],
  dayPlan: EngineSnapshot['dayPlan'],
): EngineSnapshot['schedById'] {
  return Object.fromEntries(
    schedulePlan.items.map((item) => {
      const actual = dayPlan.byBookStats[item.id];
      return [
        item.id,
        {
          ...item,
          actualStart: actual?.actualStart ?? null,
          actualEnd: actual?.actualEnd ?? null,
          hrs: round2(
            ((actual?.minutes ?? 0) + (actual?.remainingMinutes ?? 0)) / 60,
          ),
          actualHours: round2((actual?.minutes ?? 0) / 60),
          residualHours: round2((actual?.remainingMinutes ?? 0) / 60),
          unfinishedPages: actual?.unfinishedPages ?? 0,
          boostedDays: actual?.boostedDays ?? 0,
          dayPages: actual?.dayPages ?? item.dayPages,
          wks: actual?.actualWks ?? item.wks,
        },
      ];
    }),
  );
}

export function toPublicOverlapClusters(
  clusters: ReturnType<typeof buildOverlapClusters>,
): OverlapClusterSummary[] {
  return clusters.map((cluster) => ({
    id: cluster.id,
    topicIds: [...cluster.topicIds],
    bookIds: [...cluster.bookIds],
    primaryBookId: cluster.primaryBookId,
    pruning: cluster.pruning.map((entry) => ({
      bookId: entry.bookId,
      topicIds: [...entry.topicIds],
      reason: entry.reason,
      timeSaved: entry.timeSaved,
      overlapFrac: entry.overlapFrac,
      prereqPenalty: entry.prereqPenalty,
      confidence: entry.confidence,
    })),
  }));
}
