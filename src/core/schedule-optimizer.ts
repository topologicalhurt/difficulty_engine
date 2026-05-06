import { buildDayPlan } from './day-plan';
import type {
  CorpusSnapshot,
  DifficultyModelSnapshot,
  OverlapCluster,
  TopicIndex,
  RelationInfo,
} from './internal-types';
import { buildOverlapClusters } from './overlap-clusters';
import { solveSchedule } from './schedule';
import { computeScheduleStats } from './schedule-stats';
import { MAX_FASTEST_META_SEARCH_BOOKS } from './constants';
import type {
  Clock,
  PlannerProjectV1,
  ScheduleAlgorithm,
  SchedulePlan,
  ScheduleStats,
} from './types';
import { normalizeSchedAlgo } from './constraint-normalizers';

interface ScheduleCandidate {
  algorithm: ScheduleAlgorithm;
  schedulePlan: SchedulePlan;
  overlapClusters: OverlapCluster[];
  dayPlan: ReturnType<typeof buildDayPlan>;
  scheduleStats: ScheduleStats;
}

const FASTEST_CANDIDATES: ScheduleAlgorithm[] = [
  'fastest',
  'critical',
  'balanced',
  'greedy',
];

function projectWithAlgorithm(
  project: PlannerProjectV1,
  algorithm: ScheduleAlgorithm,
): PlannerProjectV1 {
  return {
    ...project,
    constraints: {
      ...project.constraints,
      schedAlgo: algorithm,
    },
  };
}

function buildCandidate(
  project: PlannerProjectV1,
  corpus: CorpusSnapshot,
  relationInfo: RelationInfo,
  difficultyModel: DifficultyModelSnapshot,
  topicIndex: TopicIndex,
  clock: Clock,
  algorithm: ScheduleAlgorithm,
): ScheduleCandidate {
  const candidateProject = projectWithAlgorithm(project, algorithm);
  const schedulePlan = solveSchedule(
    candidateProject,
    corpus,
    relationInfo,
    difficultyModel,
  );
  const overlapClusters = buildOverlapClusters(
    corpus,
    topicIndex,
    relationInfo,
    schedulePlan,
    candidateProject,
  );
  const dayPlan = buildDayPlan(
    candidateProject,
    schedulePlan,
    overlapClusters,
    clock,
  );
  const scheduleStats = computeScheduleStats(
    schedulePlan,
    dayPlan,
    candidateProject,
    clock,
  );
  return { algorithm, schedulePlan, overlapClusters, dayPlan, scheduleStats };
}

function unresolvedScore(candidate: ScheduleCandidate): number {
  return (
    candidate.scheduleStats.hardInfeasibleBooks * 1000 +
    candidate.scheduleStats.blockedBooks * 100 +
    candidate.scheduleStats.unfinishedBooks * 10 +
    candidate.scheduleStats.remainingHours
  );
}

function compareCandidates(
  left: ScheduleCandidate,
  right: ScheduleCandidate,
): number {
  const leftUnresolved = unresolvedScore(left);
  const rightUnresolved = unresolvedScore(right);
  if (leftUnresolved !== rightUnresolved)
    return leftUnresolved - rightUnresolved;
  const leftSpan = left.scheduleStats.finishDate
    ? left.scheduleStats.spanSlots
    : Number.POSITIVE_INFINITY;
  const rightSpan = right.scheduleStats.finishDate
    ? right.scheduleStats.spanSlots
    : Number.POSITIVE_INFINITY;
  if (leftSpan !== rightSpan) return leftSpan - rightSpan;
  if (left.scheduleStats.peakMinutes !== right.scheduleStats.peakMinutes) {
    return left.scheduleStats.peakMinutes - right.scheduleStats.peakMinutes;
  }
  return (
    FASTEST_CANDIDATES.indexOf(left.algorithm) -
    FASTEST_CANDIDATES.indexOf(right.algorithm)
  );
}

export function computeScheduleArtifacts(
  project: PlannerProjectV1,
  corpus: CorpusSnapshot,
  relationInfo: RelationInfo,
  difficultyModel: DifficultyModelSnapshot,
  topicIndex: TopicIndex,
  clock: Clock,
): Omit<ScheduleCandidate, 'algorithm'> {
  const selected = normalizeSchedAlgo(project.constraints.schedAlgo);
  const activeBookCount = Object.keys(project.library.books).length;
  const algorithms =
    selected === 'fastest' && activeBookCount <= MAX_FASTEST_META_SEARCH_BOOKS
      ? FASTEST_CANDIDATES
      : [selected];
  const best = algorithms
    .map((algorithm) =>
      buildCandidate(
        project,
        corpus,
        relationInfo,
        difficultyModel,
        topicIndex,
        clock,
        algorithm,
      ),
    )
    .sort(compareCandidates)[0];

  if (!best) {
    return buildCandidate(
      project,
      corpus,
      relationInfo,
      difficultyModel,
      topicIndex,
      clock,
      selected,
    );
  }
  return {
    schedulePlan: {
      ...best.schedulePlan,
      selectedAlgorithm: best.algorithm,
    },
    overlapClusters: best.overlapClusters,
    dayPlan: best.dayPlan,
    scheduleStats: best.scheduleStats,
  };
}
