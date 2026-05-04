import {
  allowedDayWindow,
  effectiveFloorPg,
  normalizeBackfillMode,
  normalizeFeasibilityMode,
  pageBounds,
  totalHours,
} from './constraints';
import { computeRelativePacingTargets } from './relative-pacing';
import type {
  CorpusSnapshot,
  DifficultyModelSnapshot,
  ExclusionState,
  RelationInfo,
} from './internal-types';
import type { PlannerProjectV1, SchedulePlanItem } from './types';
import { clamp, round1, round2 } from './utils';

export const FLOOR_RELAXED_EPSILON = 0.05;

export interface ScheduleItemBuildResult {
  activeIds: string[];
  activeIdSet: Set<string>;
  items: SchedulePlanItem[];
}

function activeBookIds(
  project: PlannerProjectV1,
  corpus: CorpusSnapshot,
  exclusionState: ExclusionState,
): string[] {
  return corpus.books
    .map((book) => book.id)
    .filter((id) => {
      const book = corpus.byId[id];
      if (exclusionState.ignoredSet.has(id) || exclusionState.rdSet.has(id)) return false;
      if (project.constraints.excComp && book.completed) return false;
      return true;
    });
}

function difficultyFor(
  id: string,
  corpus: CorpusSnapshot,
  difficultyModel: DifficultyModelSnapshot,
): number {
  const book = corpus.byId[id];
  return (
    difficultyModel.byId[id]?.scheduleDifficulty ||
    book.manualSeedDifficulty ||
    book.seedEstimate ||
    5
  );
}

export function buildScheduleItems(
  project: PlannerProjectV1,
  corpus: CorpusSnapshot,
  relationInfo: RelationInfo,
  difficultyModel: DifficultyModelSnapshot,
  exclusionState: ExclusionState,
): ScheduleItemBuildResult {
  const activeIds = activeBookIds(project, corpus, exclusionState);
  const activeIdSet = new Set(activeIds);
  const lanePreserving =
    normalizeBackfillMode(project.constraints.backfillMode) === 'lane_preserving';
  const feasibilityMode = normalizeFeasibilityMode(project.constraints.feasibilityMode);
  const strictMinPg = pageBounds(project.constraints).minPg;
  const pacingTargets = computeRelativePacingTargets(
    activeIds.map((id) => ({
      id,
      title: corpus.byId[id]?.title || id,
      pages: corpus.byId[id]?.pages || 1,
      difficulty: difficultyFor(id, corpus, difficultyModel),
    })),
    project.constraints,
  );

  const items = activeIds.map<SchedulePlanItem>((id) => {
    const book = corpus.byId[id];
    const diff = difficultyFor(id, corpus, difficultyModel);
    const pacing = pacingTargets[id] || {
      absolutePageTarget: 1,
      relativePageTarget: 1,
      relativePacingPercentile: 50,
      pacingPageTarget: 1,
    };
    const manual = project.manualOverrides.schedule[id] || {};
    const allowPrereqOverlap = Boolean(relationInfo.manualAllowOverlap[id]);
    const effectiveMin = round1(effectiveFloorPg(diff, project.constraints));
    const floorRelaxed =
      feasibilityMode === 'practical' &&
      effectiveMin < strictMinPg - FLOOR_RELAXED_EPSILON;
    const bounds = allowedDayWindow(book.pages, project.constraints, effectiveMin);
    const requestedDays =
      manual.days != null
        ? Math.max(1, Math.round(manual.days))
        : Math.max(1, Math.ceil(book.pages / Math.max(0.1, pacing.pacingPageTarget)));
    const manualWindowImpossibleReason =
      manual.days != null &&
      (requestedDays < bounds.minDays || requestedDays > bounds.maxDays)
        ? `${book.short} cannot fit the manual ${requestedDays}-day window while keeping the plan feasible.`
        : null;
    const plannedDays =
      manual.days != null
        ? requestedDays
        : clamp(requestedDays, bounds.minDays, bounds.maxDays);

    return {
      id,
      title: book.title,
      short: book.short,
      displayGroup: book.displayGroup,
      authors: [...book.authors],
      pages: book.pages,
      scheduleDifficulty: diff,
      displayDifficulty: difficultyModel.byId[id]?.displayDifficulty || diff,
      baseDays: plannedDays,
      plannedDays,
      requestedDays,
      dayPages: round1(book.pages / Math.max(1, plannedDays)),
      dayMins: round1(
        (totalHours(book.pages, diff, project.constraints) * 60) / plannedDays || 0,
      ),
      hours: round2(totalHours(book.pages, diff, project.constraints)),
      strictMinPg,
      effectiveMinPg: effectiveMin,
      floorRelaxed,
      absolutePageTarget: pacing.absolutePageTarget,
      relativePageTarget: pacing.relativePageTarget,
      relativePacingPercentile: pacing.relativePacingPercentile,
      pacingPageTarget: pacing.pacingPageTarget,
      floorPolicy: floorRelaxed ? 'relaxed' : 'strict',
      manual,
      manualOverride: manual.ds != null || manual.days != null,
      manualHardWindow: manual.ds != null || manual.days != null,
      manualStartLocked: manual.ds != null,
      manualDaysLocked: manual.days != null,
      manualWindowImpossibleReason,
      depth: difficultyModel.byId[id]?.topologicalDepth || 0,
      prereqs: (allowPrereqOverlap ? [] : relationInfo.prereqById[id] || []).filter(
        (parent) => activeIdSet.has(parent),
      ),
      allowPrereqOverlap,
      completed: Boolean(book.completed),
      scheduleRank: 0,
      windowMinDays: bounds.minDays,
      windowMaxDays: bounds.maxDays,
      lane: 0,
      laneEnforced: lanePreserving,
      releaseSlot: 0,
      targetWindow: { start: 0, end: 0 },
      targetWindowStart: 0,
      targetWindowEnd: 0,
      coStudyGroup: null,
      ds: 0,
      de: 0,
      wks: 0,
      mutualBatchIndex: 0,
      coStudyGroupSize: 1,
      lanePrevId: null,
    };
  });

  return {
    activeIds,
    activeIdSet,
    items,
  };
}
