import { WORKLOAD_SPARSE_SPECIALIZED_CONFIDENCE } from './constants';
import type {
  CorpusSnapshot,
  RelationInfo,
  TopicIndex,
  WorkloadBookAssignment,
  WorkloadCluster,
  WorkloadClusterSnapshot,
} from './internal-types';
import { mean, round1, round2, unique, clamp } from './utils';
import {
  CLUSTER_CONFIDENCE_MODEL,
  WORKLOAD_NEAREST_NEIGHBOR_LIMIT,
  WORKLOAD_TOPIC_LIMIT,
} from './workload-cluster-config';
import { median } from './workload-math';
import {
  buildWorkloadProfiles,
  type WorkloadProfile,
} from './workload-profiles';
import {
  buildWorkloadSimilarityMatrix,
  connectedWorkloadComponents,
} from './workload-similarity';

function clusterTopPhrases(ids: string[], topicIndex: TopicIndex): string[] {
  const scores: Record<string, number> = {};
  ids.forEach((id) => {
    Object.entries(topicIndex.bookStats[id]?.topicWeights || {}).forEach(
      ([topic, score]) => {
        scores[topic] = (scores[topic] || 0) + score;
      },
    );
  });
  return Object.entries(scores)
    .sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )
    .slice(0, WORKLOAD_TOPIC_LIMIT)
    .map(([topic]) => topic);
}

function clusterConfidence(
  members: WorkloadProfile[],
  ids: string[],
  similarity: Record<string, Record<string, number>>,
): number {
  const memberConfidence = mean(
    members.map((profile) => profile.metadataConfidence),
  );
  const connectivity = mean(
    members.flatMap((profile) =>
      ids
        .filter((id) => id !== profile.id)
        .map((id) => similarity[profile.id]?.[id] || 0),
    ),
  );
  return round2(
    clamp(
      memberConfidence * CLUSTER_CONFIDENCE_MODEL.metadataWeight +
        Math.min(1, ids.length / CLUSTER_CONFIDENCE_MODEL.sizeNormalizer) *
          CLUSTER_CONFIDENCE_MODEL.sizeWeight +
        connectivity * CLUSTER_CONFIDENCE_MODEL.connectivityWeight,
      CLUSTER_CONFIDENCE_MODEL.min,
      CLUSTER_CONFIDENCE_MODEL.max,
    ),
  );
}

function nearestBookIds(
  profile: WorkloadProfile,
  similarity: Record<string, Record<string, number>>,
): string[] {
  return Object.entries(similarity[profile.id] || {})
    .sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )
    .slice(0, WORKLOAD_NEAREST_NEIGHBOR_LIMIT)
    .map(([id]) => id);
}

function similarityToCluster(
  profile: WorkloadProfile,
  ids: string[],
  similarity: Record<string, Record<string, number>>,
): number {
  if (ids.length <= 1) return 1;
  return round2(
    mean(
      ids
        .filter((id) => id !== profile.id)
        .map((id) => similarity[profile.id]?.[id] || 0),
    ),
  );
}

function workloadPrior(
  members: WorkloadProfile[],
  rawPrior: number,
  confidence: number,
  libraryMedianWorkload: number,
): number {
  const singletonSpecialized =
    members.length === 1 && Boolean(members[0]?.sparseSpecialized);
  return round1(
    singletonSpecialized
      ? Math.max(
          rawPrior,
          members[0]?.corpusComplexity || rawPrior,
          libraryMedianWorkload,
        )
      : rawPrior * confidence + libraryMedianWorkload * (1 - confidence),
  );
}

function buildAssignment(
  profile: WorkloadProfile,
  clusterId: string,
  ids: string[],
  prior: number,
  confidence: number,
  similarity: Record<string, Record<string, number>>,
): WorkloadBookAssignment {
  const liftConfidence = profile.sparseSpecialized
    ? Math.max(confidence, WORKLOAD_SPARSE_SPECIALIZED_CONFIDENCE)
    : confidence;
  return {
    bookId: profile.id,
    clusterId,
    subjectWorkloadPrior: prior,
    metadataConfidence: profile.metadataConfidence,
    clusterConfidence: round2(liftConfidence),
    similarityToCluster: similarityToCluster(profile, ids, similarity),
    nearestBookIds: nearestBookIds(profile, similarity),
    evidenceSources: profile.evidenceSources,
    sparseSpecialized: profile.sparseSpecialized,
    shrinkageApplied:
      confidence < CLUSTER_CONFIDENCE_MODEL.shrinkageConfidenceCutoff ||
      profile.metadataConfidence <
        CLUSTER_CONFIDENCE_MODEL.shrinkageMetadataCutoff,
    explanation: profile.sparseSpecialized
      ? 'Sparse metadata; workload prior is held near corpus complexity instead of treating the book as confidently easy.'
      : `Cluster prior from ${ids.length} book(s), ${Math.round(confidence * 100)}% confidence.`,
  };
}

export function buildWorkloadClusters(
  corpus: CorpusSnapshot,
  topicIndex: TopicIndex,
  relationInfo: RelationInfo,
): WorkloadClusterSnapshot {
  const profiles = buildWorkloadProfiles(corpus, topicIndex, relationInfo);
  const byProfile = Object.fromEntries(
    profiles.map((profile) => [profile.id, profile]),
  );
  const libraryMedianWorkload = round1(
    median(profiles.map((profile) => profile.initialWorkload)),
  );
  const similarity = buildWorkloadSimilarityMatrix(profiles, relationInfo);
  const byBookId: Record<string, WorkloadBookAssignment> = {};
  const clusters: WorkloadCluster[] = connectedWorkloadComponents(
    profiles,
    similarity,
  ).map((ids, index) => {
    const members = ids.map((id) => byProfile[id]);
    const rawPrior = median(members.map((profile) => profile.initialWorkload));
    const confidence = clusterConfidence(members, ids, similarity);
    const topPhrases = clusterTopPhrases(ids, topicIndex);
    const prior = workloadPrior(
      members,
      rawPrior,
      confidence,
      libraryMedianWorkload,
    );
    const clusterId = `workload-${index + 1}`;
    const assignments = members.map((profile) => {
      const assignment = buildAssignment(
        profile,
        clusterId,
        ids,
        prior,
        confidence,
        similarity,
      );
      byBookId[profile.id] = assignment;
      return assignment;
    });
    return {
      id: clusterId,
      label:
        topPhrases.slice(0, 2).join(' / ') || `Workload cluster ${index + 1}`,
      bookIds: ids,
      topPhrases,
      workloadPrior: prior,
      confidence,
      evidenceSources: unique(
        members.flatMap((profile) => profile.evidenceSources),
      ),
      assignments,
    };
  });

  return { clusters, byBookId, libraryMedianWorkload };
}
