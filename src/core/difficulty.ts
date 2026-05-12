import { DIFFICULTY_HIGH_UNCERTAINTY, SUBJECT_WORKLOAD_DEFAULT, WORKLOAD_LIFT_CAP } from './constants';
import { calibrateLatentWorkloads } from './difficulty-calibration';
import { buildDifficultyEvidence } from './difficulty-evidence';
import { applyGraphWorkloadPropagation } from './difficulty-graph';
import { applyLearnerCalibration } from './difficulty-learner';
import { estimateLatentWorkload } from './difficulty-latent';
import { effectiveReadingPagesById } from './effective-pages';
import { profilePolicy } from './profile-policy';
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
import { topologicalDepth } from './relation-graph-utils';
import type { PlannerProjectV1 } from './types';
import { clamp, round1, round2, safeNumber } from './utils';

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
  evidenceConfidence: number,
  project: PlannerProjectV1,
): number {
  const strength = workloadStrength(project);
  if (strength <= 0) return 0;
  const confidence = clamp(clusterConfidence, 0, 1);
  return round2(
    clamp(
      (clusterPrior - baseDifficulty) *
        strength *
        Math.pow(confidence, 1.15) *
        clamp(1 - evidenceConfidence, 0.2, 1),
      -WORKLOAD_LIFT_CAP,
      WORKLOAD_LIFT_CAP,
    ),
  );
}

function difficultyBindingReason(input: {
  locked: boolean;
  uncertainty: number;
  learnerLift: number;
}): string | null {
  if (input.locked) return 'manual_lock';
  if (Math.abs(input.learnerLift) > 0.01) return 'learner_calibrated';
  if (input.uncertainty >= DIFFICULTY_HIGH_UNCERTAINTY) {
    return 'high_uncertainty';
  }
  return null;
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
  const evidenceById = buildDifficultyEvidence(corpus, topicIndex, project);
  const readingPagesById = effectiveReadingPagesById(project);
  const policy = profilePolicy(project.constraints);
  const latentById = calibrateLatentWorkloads(
    ids.map((id) => ({
      id,
      estimate: estimateLatentWorkload(evidenceById[id]),
      locked: Boolean(corpus.byId[id]?.lockDiff),
    })),
  );
  const model: DifficultyModelSnapshot['byId'] = {};
  const order = [...ids].sort(
    (left, right) => depths[left] - depths[right] || left.localeCompare(right),
  );

  order.forEach((id) => {
    const book = corpus.byId[id];
    const evidence = evidenceById[id];
    const latent = latentById[id] || estimateLatentWorkload(evidence);
    const readingPages = readingPagesById[id];
    const workload = workloadClusters?.byBookId[id];
    const subjectWorkloadPrior =
      workload?.subjectWorkloadPrior ?? round1(latent.latentWorkload);
    const subjectLift = book.lockDiff
      ? 0
      : subjectWorkloadLift(
          latent.latentWorkload,
          subjectWorkloadPrior,
          workload?.clusterConfidence ?? 0,
          latent.evidenceConfidence,
          project,
        );
    const workloadBaseDifficulty = book.lockDiff
      ? evidence.seed
      : clamp(latent.latentWorkload + subjectLift, 1, 10);
    const prereqs = (relationInfo.prereqById[id] || []).filter(
      (parent) => model[parent] && !corpus.byId[parent]?.noPropOut,
    );
    const graph = applyGraphWorkloadPropagation({
      id,
      seed: evidence.seed,
      baseDifficulty: workloadBaseDifficulty,
      prereqs,
      parentModel: model,
      depths,
      relationInfo,
      project,
      evidenceConfidence: latent.evidenceConfidence,
    });
    const graphWorkloadLift = book.lockDiff ? 0 : graph.graphWorkloadLift;
    const propagatedDifficulty = clamp(
      workloadBaseDifficulty + graphWorkloadLift,
      1,
      10,
    );
    const profileAdjustedDifficulty = book.lockDiff
      ? workloadBaseDifficulty
      : clamp(
          (project.constraints.blendMode === 'linear'
            ? propagatedDifficulty
            : Math.sqrt(
                Math.max(0.1, workloadBaseDifficulty) *
                  Math.max(0.1, propagatedDifficulty),
              )) + policy.difficultyLift,
          1,
          10,
        );
    const learner = applyLearnerCalibration({
      project,
      bookId: id,
      baseDifficulty: profileAdjustedDifficulty,
      lockDiff: book.lockDiff,
    });
    const scheduleDifficulty = book.lockDiff
      ? round1(evidence.seed)
      : round1(
          clamp(
            profileAdjustedDifficulty + learner.learnerCalibrationLift,
            1,
            10,
          ),
        );
    const difficultyEvidence = [
      ...latent.reasons,
      subjectLift
        ? `Adaptive workload prior ${round1(subjectWorkloadPrior)} contributes ${round2(subjectLift)} from ${Math.round((workload?.clusterConfidence ?? 0) * 100)}% cluster confidence.`
        : 'No adaptive workload lift contributes to this score.',
      ...(book.lockDiff
        ? ['Manual difficulty lock disables graph and learner difficulty lifts.']
        : graph.reasons),
      learner.reason,
      policy.difficultyLift
        ? `${policy.profile.mode} profile applies a bounded ${round2(policy.difficultyLift)} workload/time calibration lift.`
        : 'Learner profile leaves schedule difficulty neutral and affects pacing/ramp policy.',
    ];

    model[id] = {
      seed: evidence.seed,
      corpusComplexity: evidence.corpusComplexity,
      latentWorkload: latent.latentWorkload,
      workloadUncertainty: latent.workloadUncertainty,
      evidenceConfidence: latent.evidenceConfidence,
      subjectWorkloadPrior: round1(subjectWorkloadPrior),
      subjectWorkloadLift: round2(subjectLift),
      subjectClusterId: workload?.clusterId ?? null,
      subjectClusterConfidence: round2(workload?.clusterConfidence ?? 0),
      metadataConfidence: round2(
        Math.max(evidence.metadataConfidence, workload?.metadataConfidence ?? 0),
      ),
      physicalPages: readingPages?.physicalPages ?? book.pages,
      effectiveReadingPages: readingPages?.effectivePages ?? book.pages,
      skippedReadingPages: readingPages?.skippedPages ?? 0,
      readingScopeConfidence: readingPages?.confidence ?? 0,
      readingScopeReason: readingPages?.bindingReason ?? null,
      graphBurden: graph.graphBurden,
      graphWorkloadLift,
      learnerCalibrationLift: learner.learnerCalibrationLift,
      profileAdjustedDifficulty: round1(profileAdjustedDifficulty),
      difficultyBindingReason: difficultyBindingReason({
        locked: book.lockDiff,
        uncertainty: latent.workloadUncertainty,
        learnerLift: learner.learnerCalibrationLift,
      }),
      difficultyEvidence,
      noveltyLoad: graph.noveltyLoad,
      breadthLoad: graph.breadthLoad,
      retentionLoad: graph.retentionLoad,
      scheduleDifficulty,
      displayDifficulty: scheduleDifficulty,
      topologicalDepth: depths[id] || 0,
      explanation: [
        `Latent workload ${latent.latentWorkload} with ${Math.round(latent.evidenceConfidence * 100)}% evidence confidence anchors the score.`,
        ...difficultyEvidence.slice(0, 4),
        `Schedule difficulty ${scheduleDifficulty} is planner truth; display difficulty is mapped separately.`,
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
