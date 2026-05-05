import { buildTopicIndex, extractCorpus } from './corpus';
import { runDiagnostics } from './diagnostics';
import { computeDifficultyModel } from './difficulty';
import {
  buildSchedById,
  buildSortedBooks,
  toPublicDifficulty,
  toPublicOverlapClusters,
  toPublicTopics,
  toPublicWorkloadClusters,
} from './engine-public-mappers';
import type { PlannerServices } from './internal-types';
import { inferRelations } from './relations';
import { buildRenderModel } from './render-model';
import { computeScheduleArtifacts } from './schedule-optimizer';
import { plannerClock } from './time';
import { buildWorkloadClusters } from './workload-clusters';
import type {
  Clock,
  EngineSnapshot,
  Logger,
  PlannerEngine,
  PlannerProjectV1,
} from './types';

const NOOP_LOGGER: Logger = {
  debug(): void {},
  info(): void {},
  warn(): void {},
  error(): void {},
};

function servicesWithDefaults(
  services?: Partial<PlannerServices>,
): PlannerServices {
  return {
    clock: services?.clock ?? plannerClock,
    logger: services?.logger ?? NOOP_LOGGER,
  };
}

export function computePlannerSnapshot(
  project: PlannerProjectV1,
  services?: Partial<PlannerServices>,
): EngineSnapshot {
  const resolvedServices = servicesWithDefaults(services);
  const { logger, clock } = resolvedServices;

  logger.debug('planner.compute.start', {
    books: Object.keys(project.library.books).length,
  });

  const corpus = extractCorpus(project);
  const topicIndex = buildTopicIndex(corpus);
  const relationInfo = inferRelations(corpus, topicIndex, project);
  const workloadClusterInfo = buildWorkloadClusters(
    corpus,
    topicIndex,
    relationInfo,
  );
  const difficultyModel = computeDifficultyModel(
    corpus,
    topicIndex,
    relationInfo,
    project,
    workloadClusterInfo,
  );
  const { schedulePlan, overlapClusters, dayPlan, scheduleStats } =
    computeScheduleArtifacts(
      project,
      corpus,
      relationInfo,
      difficultyModel,
      topicIndex,
      clock,
    );
  const { topics, topicsById } = toPublicTopics(topicIndex);
  const publicDifficulty = toPublicDifficulty(difficultyModel);
  const sortedBooks = buildSortedBooks(project, corpus, difficultyModel);

  const snapshotWithoutRender: Omit<
    EngineSnapshot,
    'renderModel' | 'diagnostics'
  > = {
    topics,
    topicsById,
    overlapClusters: toPublicOverlapClusters(overlapClusters),
    workloadClusters: toPublicWorkloadClusters(workloadClusterInfo.clusters),
    relations: relationInfo.relations,
    relationConfidence: relationInfo.confidence,
    difficultyModel: publicDifficulty,
    schedulePlan,
    dayPlan,
    scheduleStats,
    sortedBooks,
    groupSummary: schedulePlan.groupSummary,
    graphPrereqsById: schedulePlan.graphPrereqsById,
    coStudyMeta: schedulePlan.coStudyMeta,
    schedById: buildSchedById(schedulePlan, dayPlan),
  };

  const diagnostics = runDiagnostics(project, snapshotWithoutRender);
  const renderModel = buildRenderModel(
    project,
    snapshotWithoutRender,
    clock.totalTimelineSlots(project),
  );
  const snapshot: EngineSnapshot = {
    ...snapshotWithoutRender,
    diagnostics,
    renderModel,
  };

  logger.info('planner.compute.complete', {
    relations: snapshot.relations.length,
    scheduled: snapshot.schedulePlan.items.length,
    finishDate: snapshot.scheduleStats.finishDate?.toISOString() ?? null,
  });

  return snapshot;
}

export function createPlannerEngine(services?: {
  clock?: Clock;
  logger?: Logger;
}): PlannerEngine {
  const resolvedServices = servicesWithDefaults(services);
  return {
    computeSnapshot(project: PlannerProjectV1): EngineSnapshot {
      return computePlannerSnapshot(project, resolvedServices);
    },
  };
}
