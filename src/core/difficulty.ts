import {
  BREADTH_LOAD_MULTIPLIER,
  GRAPH_BURDEN_DEPTH_WEIGHT,
  GRAPH_BURDEN_PARENT_WEIGHT,
  NOVELTY_LOAD_MULTIPLIER,
  RETENTION_LOAD_MULTIPLIER,
  SCHEDULE_DIFFICULTY_CORPUS_WEIGHT,
  SCHEDULE_DIFFICULTY_SEED_WEIGHT,
  SUBJECT_WORKLOAD_DEFAULT,
  WORKLOAD_LIFT_CAP,
} from './constants';
import {
  difficultyDistributionStats,
  mapDisplayDifficulty,
} from './difficulty-mapping';
import type {
  CorpusSnapshot,
  DifficultyModelSnapshot,
  RelationInfo,
  TopicIndex,
  WorkloadClusterSnapshot,
} from './internal-types';
import type { PlannerProjectV1 } from './types';
import { topologicalDepth } from './relation-graph-utils';
import { clamp, mean, round1, round2, safeNumber } from './utils';

const NEUTRAL_MANUAL_SEED = 5;
const MANUAL_SEED_BLEND_WEIGHT = 0.65;
const CORPUS_SEED_BLEND_WEIGHT = 1 - MANUAL_SEED_BLEND_WEIGHT;
const NEUTRAL_SEED_EPSILON = 0.05;

function effectiveSeed(book: {
  lockDiff: boolean;
  manualSeedDifficulty: number;
  seedEstimate: number;
}): number {
  const manualSeed = clamp(
    safeNumber(book.manualSeedDifficulty, NEUTRAL_MANUAL_SEED),
    1,
    10,
  );
  const corpusSeed = clamp(safeNumber(book.seedEstimate, manualSeed), 1, 10);
  if (book.lockDiff) {
    return manualSeed;
  }
  if (Math.abs(manualSeed - NEUTRAL_MANUAL_SEED) <= NEUTRAL_SEED_EPSILON) {
    return corpusSeed;
  }
  return clamp(
    manualSeed * MANUAL_SEED_BLEND_WEIGHT +
      corpusSeed * CORPUS_SEED_BLEND_WEIGHT,
    1,
    10,
  );
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

function workloadStrength(project: PlannerProjectV1): number {
  return (
    clamp(
      safeNumber(
        project.constraints.subjectWorkloadStrength,
        SUBJECT_WORKLOAD_DEFAULT,
      ),
      0,
      100,
    ) / 100
  );
}

function subjectWorkloadLift(
  baseDifficulty: number,
  clusterPrior: number,
  clusterConfidence: number,
  project: PlannerProjectV1,
): number {
  const strength = workloadStrength(project);
  if (strength <= 0) return 0;
  return round2(
    clamp(
      (clusterPrior - baseDifficulty) *
        strength *
        clamp(clusterConfidence, 0, 1),
      -WORKLOAD_LIFT_CAP,
      WORKLOAD_LIFT_CAP,
    ),
  );
}

export function computeDifficultyModel(
  corpus: CorpusSnapshot,
  topicIndex: TopicIndex,
  relationInfo: RelationInfo,
  project: PlannerProjectV1,
  workloadClusters?: WorkloadClusterSnapshot,
): DifficultyModelSnapshot {
  const ids = corpus.books.map((book) => book.id);
  const depths = topologicalDepth(ids, relationInfo.prereqById);
  const model: DifficultyModelSnapshot['byId'] = {};
  const order = [...ids].sort(
    (left, right) => depths[left] - depths[right] || left.localeCompare(right),
  );

  order.forEach((id) => {
    const book = corpus.byId[id];
    const bookStats = topicIndex.bookStats[id] || { baseComplexity: 5 };
    const seed = effectiveSeed(book);
    const corpusComplexity = clamp(bookStats.baseComplexity || seed, 1, 10);
    const prereqs = (relationInfo.prereqById[id] || []).filter(
      (parent) => model[parent] && !corpus.byId[parent]?.noPropOut,
    );
    const parentScores = prereqs.map(
      (parent) => model[parent]?.scheduleDifficulty || 0,
    );
    const graphBurden = round2(
      prereqs.length
        ? (mean(parentScores) - seed) * GRAPH_BURDEN_PARENT_WEIGHT +
            (depths[id] || 0) * GRAPH_BURDEN_DEPTH_WEIGHT
        : 0,
    );
    const transferSignals = prereqs.map((parent) => {
      return prerequisiteCoverage(relationInfo, parent, id);
    });
    const novelty = round2(clamp(1 - mean(transferSignals), 0, 1.2));
    const breadth = round2(clamp(Math.log2(prereqs.length + 1) / 2.8, 0, 1.5));
    const retention = round2(
      clamp(
        (mean(parentScores) *
          safeNumber(project.constraints.prereqRetention, 0.45)) /
          10,
        0,
        1.5,
      ),
    );
    const noveltyLoad = round2(
      novelty *
        safeNumber(project.constraints.propNovelty, 0.18) *
        NOVELTY_LOAD_MULTIPLIER,
    );
    const breadthLoad = round2(
      breadth *
        safeNumber(project.constraints.propBreadth, 0.12) *
        BREADTH_LOAD_MULTIPLIER,
    );
    const retentionLoad = round2(retention * RETENTION_LOAD_MULTIPLIER);
    const baseDifficulty =
      seed * SCHEDULE_DIFFICULTY_SEED_WEIGHT +
      corpusComplexity * SCHEDULE_DIFFICULTY_CORPUS_WEIGHT;
    const workload = workloadClusters?.byBookId[id];
    const subjectWorkloadPrior =
      workload?.subjectWorkloadPrior ?? round1(baseDifficulty);
    const subjectLift = book.lockDiff
      ? 0
      : subjectWorkloadLift(
          baseDifficulty,
          subjectWorkloadPrior,
          workload?.clusterConfidence ?? 0,
          project,
        );
    const workloadBaseDifficulty = clamp(baseDifficulty + subjectLift, 1, 10);
    const rawGraphLift =
      graphBurden + noveltyLoad + breadthLoad + retentionLoad;
    const graphLift =
      rawGraphLift *
      clamp(safeNumber(project.constraints.propMix, 0.65), 0, 1) *
      (1 - clamp(safeNumber(project.constraints.damp, 0.35), 0, 1));
    const graphCap = Math.max(
      safeNumber(project.constraints.absFloor, 0.55),
      Math.abs(workloadBaseDifficulty) *
        clamp(safeNumber(project.constraints.alphaCap, 0.5), 0, 1),
    );
    const absoluteLiftCap = Math.max(
      0,
      safeNumber(project.constraints.propLiftCap, graphCap),
    );
    const cappedLift = clamp(
      graphLift,
      -Math.min(graphCap, absoluteLiftCap),
      Math.min(graphCap, absoluteLiftCap),
    );
    const propagatedDifficulty = clamp(
      workloadBaseDifficulty + cappedLift,
      1,
      10,
    );
    const blendedDifficulty =
      project.constraints.blendMode === 'linear'
        ? propagatedDifficulty
        : Math.sqrt(
            Math.max(0.1, workloadBaseDifficulty) *
              Math.max(0.1, propagatedDifficulty),
          );
    const scheduleDifficulty = round1(clamp(blendedDifficulty, 1, 10));

    model[id] = {
      seed: round1(seed),
      corpusComplexity: round1(corpusComplexity),
      subjectWorkloadPrior: round1(subjectWorkloadPrior),
      subjectWorkloadLift: round2(subjectLift),
      subjectClusterId: workload?.clusterId ?? null,
      subjectClusterConfidence: round2(workload?.clusterConfidence ?? 0),
      metadataConfidence: round2(workload?.metadataConfidence ?? 0),
      graphBurden,
      noveltyLoad,
      breadthLoad,
      retentionLoad,
      scheduleDifficulty,
      displayDifficulty: scheduleDifficulty,
      topologicalDepth: depths[id] || 0,
      explanation: [
        `Seed difficulty ${round1(seed)} and corpus complexity ${round1(corpusComplexity)} anchor the score.`,
        subjectLift
          ? `Adaptive workload prior ${round1(subjectWorkloadPrior)} contributes ${round2(subjectLift)} from ${Math.round((workload?.clusterConfidence ?? 0) * 100)}% confidence cluster evidence.`
          : 'No adaptive workload lift contributes to this score.',
        prereqs.length
          ? `${prereqs.length} prerequisite(s) contribute graph burden ${round2(graphBurden)}.`
          : 'No prerequisite burden contributes to this score.',
        `Novelty load ${round2(noveltyLoad)}, breadth load ${round2(breadthLoad)}, and retention load ${round2(retentionLoad)} complete the schedule difficulty.`,
      ],
    };
  });

  const stats = difficultyDistributionStats(
    Object.values(model).map((entry) => entry.scheduleDifficulty),
  );
  Object.values(model).forEach((entry) => {
    entry.displayDifficulty = mapDisplayDifficulty(
      entry.scheduleDifficulty,
      project.constraints,
      stats,
    );
  });

  return { byId: model, depths };
}
