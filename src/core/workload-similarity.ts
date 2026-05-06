import {
  WORKLOAD_CLUSTER_SIMILARITY_THRESHOLD,
  WORKLOAD_FINGERPRINT_SIMILARITY_WEIGHT,
  MAX_EXHAUSTIVE_WORKLOAD_PROFILES,
  MAX_WORKLOAD_INDEX_FEATURE_FREQUENCY,
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
  const similarity: Record<string, Record<string, number>> = Object.fromEntries(
    profiles.map((profile) => [profile.id, {}]),
  );
  const byId = Object.fromEntries(
    profiles.map((profile) => [profile.id, profile]),
  );

  workloadSimilarityPairIds(profiles, relationInfo).forEach(
    ([leftId, rightId]) => {
      const left = byId[leftId];
      const right = byId[rightId];
      if (!left || !right) return;
      const score = profileSimilarity(left, right, relationInfo);
      similarity[leftId][rightId] = score;
      similarity[rightId][leftId] = score;
    },
  );
  return similarity;
}

function workloadSimilarityPairIds(
  profiles: WorkloadProfile[],
  relationInfo: RelationInfo,
): Array<[string, string]> {
  if (profiles.length <= MAX_EXHAUSTIVE_WORKLOAD_PROFILES) {
    const pairs: Array<[string, string]> = [];
    for (let left = 0; left < profiles.length; left += 1) {
      for (let right = left + 1; right < profiles.length; right += 1) {
        pairs.push([profiles[left].id, profiles[right].id]);
      }
    }
    return pairs;
  }

  const profileIds = new Set(profiles.map((profile) => profile.id));
  const pairKeys = new Set(
    Object.keys(relationInfo.byPair).filter((key) => {
      const [leftId, rightId] = key.split('|');
      return profileIds.has(leftId) && profileIds.has(rightId);
    }),
  );
  const featureToIds = new Map<string, string[]>();
  profiles.forEach((profile) => {
    Object.keys(profile.topicWeights).forEach((feature) => {
      const ids = featureToIds.get(feature) ?? [];
      ids.push(profile.id);
      featureToIds.set(feature, ids);
    });
  });

  featureToIds.forEach((ids) => {
    const sortedIds = [...new Set(ids)].sort();
    if (sortedIds.length > MAX_WORKLOAD_INDEX_FEATURE_FREQUENCY) return;
    for (let left = 0; left < sortedIds.length; left += 1) {
      for (let right = left + 1; right < sortedIds.length; right += 1) {
        pairKeys.add([sortedIds[left], sortedIds[right]].sort().join('|'));
      }
    }
  });

  return [...pairKeys]
    .map((key): [string, string] | null => {
      const [leftId, rightId] = key.split('|');
      return leftId && rightId && leftId !== rightId ? [leftId, rightId] : null;
    })
    .filter((pair): pair is [string, string] => Boolean(pair))
    .sort(
      ([leftA, rightA], [leftB, rightB]) =>
        leftA.localeCompare(leftB) || rightA.localeCompare(rightB),
    );
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
