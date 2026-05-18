import {
  BREADTH_LOAD_MULTIPLIER,
  GRAPH_BURDEN_DEPTH_WEIGHT,
  GRAPH_BURDEN_PARENT_WEIGHT,
  NOVELTY_LOAD_MULTIPLIER,
  RETENTION_LOAD_MULTIPLIER,
} from './constants';
import type { DifficultyModelEntry, RelationInfo } from './internal-types';
import type { PlannerProjectV1 } from './types';
import { clamp, mean, round2, safeNumber } from './utils';
import { learnerProfile } from './difficulty-profiles';

// Research note: graph signals are treated as prerequisite/knowledge-graph
// evidence, not as proof that later/deeper nodes are intrinsically harder.
// Depth and parent workload are capped and confidence-weighted so a deferred
// research/reference book does not climb toward the ceiling merely because it
// appears late in the DAG. See learning-path/prerequisite graph surveys:
// https://www.mdpi.com/2079-9292/15/1/238
export interface GraphWorkloadResult {
  graphBurden: number;
  noveltyLoad: number;
  breadthLoad: number;
  retentionLoad: number;
  graphWorkloadLift: number;
  transferSignals: number[];
  reasons: string[];
}

function prerequisiteCoverage(
  relationInfo: RelationInfo,
  prerequisiteId: string,
  childId: string,
): number {
  const pair = relationInfo.byPair[[prerequisiteId, childId].sort().join('|')];
  if (!pair) return 0;
  if (pair.leftId === prerequisiteId && pair.rightId === childId) {
    return pair.coverageAB || 0;
  }
  if (pair.leftId === childId && pair.rightId === prerequisiteId) {
    return pair.coverageBA || 0;
  }
  return 0;
}

export function applyGraphWorkloadPropagation(input: {
  id: string;
  seed: number;
  baseDifficulty: number;
  prereqs: string[];
  parentModel: Record<string, DifficultyModelEntry>;
  depths: Record<string, number>;
  relationInfo: RelationInfo;
  project: PlannerProjectV1;
  evidenceConfidence: number;
}): GraphWorkloadResult {
  const parentScores = input.prereqs.map(
    (parent) => input.parentModel[parent]?.scheduleDifficulty || 0,
  );
  const graphBurden = round2(
    input.prereqs.length
      ? (mean(parentScores) - input.seed) * GRAPH_BURDEN_PARENT_WEIGHT +
          (input.depths[input.id] || 0) * GRAPH_BURDEN_DEPTH_WEIGHT
      : 0,
  );
  const transferSignals = input.prereqs.map((parent) =>
    prerequisiteCoverage(input.relationInfo, parent, input.id),
  );
  const novelty = round2(clamp(1 - mean(transferSignals), 0, 1.2));
  const breadth = round2(
    clamp(Math.log2(input.prereqs.length + 1) / 2.8, 0, 1.5),
  );
  const retention = round2(
    clamp(
      (mean(parentScores) *
        safeNumber(input.project.constraints.prereqRetention, 0.45)) /
        10,
      0,
      1.5,
    ),
  );
  const noveltyLoad = round2(
    novelty *
      safeNumber(input.project.constraints.propNovelty, 0.18) *
      NOVELTY_LOAD_MULTIPLIER,
  );
  const breadthLoad = round2(
    breadth *
      safeNumber(input.project.constraints.propBreadth, 0.12) *
      BREADTH_LOAD_MULTIPLIER,
  );
  const retentionLoad = round2(retention * RETENTION_LOAD_MULTIPLIER);
  const rawGraphLift = graphBurden + noveltyLoad + breadthLoad + retentionLoad;
  const profile = learnerProfile(input.project.constraints);
  const graphLift =
    rawGraphLift *
    clamp(safeNumber(input.project.constraints.propMix, 0.65), 0, 1) *
    (1 - clamp(safeNumber(input.project.constraints.damp, 0.35), 0, 1)) *
    clamp(input.evidenceConfidence / Math.max(0.1, profile.graphConfidence), 0.25, 1.15);
  const graphCap = Math.max(
    safeNumber(input.project.constraints.absFloor, 0.55),
    Math.abs(input.baseDifficulty) *
      clamp(safeNumber(input.project.constraints.alphaCap, 0.5), 0, 1),
  );
  const absoluteLiftCap = Math.max(
    0,
    safeNumber(input.project.constraints.propLiftCap, graphCap),
  );
  const graphWorkloadLift = round2(
    clamp(
      graphLift,
      -Math.min(graphCap, absoluteLiftCap),
      Math.min(graphCap, absoluteLiftCap),
    ),
  );
  return {
    graphBurden,
    noveltyLoad,
    breadthLoad,
    retentionLoad,
    graphWorkloadLift,
    transferSignals,
    reasons: input.prereqs.length
      ? [
          `${input.prereqs.length} prerequisite(s) produce graph lift ${graphWorkloadLift}.`,
          `Novelty ${noveltyLoad}, breadth ${breadthLoad}, retention ${retentionLoad}.`,
        ]
      : ['No prerequisite graph lift contributes to this score.'],
  };
}
