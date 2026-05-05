import {
  WORKLOAD_CLUSTER_SIMILARITY_THRESHOLD,
  WORKLOAD_FINGERPRINT_SIMILARITY_WEIGHT,
  WORKLOAD_RELATION_SIMILARITY_WEIGHT,
  WORKLOAD_TOKEN_SIMILARITY_WEIGHT,
  WORKLOAD_TOPIC_SIMILARITY_WEIGHT,
} from './constants';
import type { RelationInfo } from './internal-types';
import { clamp, round2 } from './utils';
import { WORKLOAD_FINGERPRINT_DISTANCE } from './workload-cluster-config';
import { weightedJaccard } from './workload-math';
import type { WorkloadProfile } from './workload-profiles';

function workloadFingerprintSimilarity(
  left: WorkloadProfile,
  right: WorkloadProfile,
): number {
  return (
    1 -
    Math.min(
      1,
      Math.abs(left.initialWorkload - right.initialWorkload) /
        WORKLOAD_FINGERPRINT_DISTANCE,
    )
  );
}

function profileSimilarity(
  left: WorkloadProfile,
  right: WorkloadProfile,
  relationInfo: RelationInfo,
): number {
  const pair = relationInfo.byPair[[left.id, right.id].sort().join('|')];
  const relationSimilarity = pair
    ? Math.max(pair.overlap || 0, pair.coStudyScore || 0, pair.reference || 0)
    : 0;
  return round2(
    clamp(
      weightedJaccard(left.topicWeights, right.topicWeights) *
        WORKLOAD_TOPIC_SIMILARITY_WEIGHT +
        weightedJaccard(left.tokenWeights, right.tokenWeights) *
          WORKLOAD_TOKEN_SIMILARITY_WEIGHT +
        relationSimilarity * WORKLOAD_RELATION_SIMILARITY_WEIGHT +
        workloadFingerprintSimilarity(left, right) *
          WORKLOAD_FINGERPRINT_SIMILARITY_WEIGHT,
      0,
      1,
    ),
  );
}

export function buildWorkloadSimilarityMatrix(
  profiles: WorkloadProfile[],
  relationInfo: RelationInfo,
): Record<string, Record<string, number>> {
  const similarity: Record<string, Record<string, number>> = {};
  profiles.forEach((left) => {
    similarity[left.id] = {};
    profiles.forEach((right) => {
      if (left.id !== right.id) {
        similarity[left.id][right.id] = profileSimilarity(
          left,
          right,
          relationInfo,
        );
      }
    });
  });
  return similarity;
}

export function connectedWorkloadComponents(
  profiles: WorkloadProfile[],
  similarity: Record<string, Record<string, number>>,
): string[][] {
  const seen = new Set<string>();
  return profiles
    .map((profile) => {
      if (seen.has(profile.id)) return [];
      const stack = [profile.id];
      const ids: string[] = [];
      seen.add(profile.id);
      while (stack.length) {
        const id = stack.pop() as string;
        ids.push(id);
        Object.entries(similarity[id] || {}).forEach(([nextId, score]) => {
          if (
            score >= WORKLOAD_CLUSTER_SIMILARITY_THRESHOLD &&
            !seen.has(nextId)
          ) {
            seen.add(nextId);
            stack.push(nextId);
          }
        });
      }
      return ids.sort();
    })
    .filter((ids) => ids.length > 0)
    .sort((left, right) => left[0].localeCompare(right[0]));
}
