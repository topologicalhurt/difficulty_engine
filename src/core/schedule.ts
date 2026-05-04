import { enforceBookOrderPrereqs } from './book-order';
import { normalizeBackfillMode, normalizeSchedAlgo } from './constraints';
import { computeExclusionState } from './exclusion';
import type { CorpusSnapshot, DifficultyModelSnapshot, RelationInfo } from './internal-types';
import { buildScheduleGroups, buildCoStudyMeta } from './schedule-groups';
import { buildScheduleItems } from './schedule-items';
import {
  annotateLanePredecessors,
  packFlexibleSchedule,
  packLanePreservingSchedule,
  sortScheduleItems,
} from './schedule-lanes';
import { groupBooks } from './schedule-group-summary';
import { scheduleOrder } from './schedule-order';
import type { PlannerProjectV1, SchedulePlan, SchedulePlanItem } from './types';

function applySchedulePrerequisites(
  items: SchedulePlanItem[],
  prereqById: Record<string, string[]>,
): {
  items: SchedulePlanItem[];
  itemById: Record<string, SchedulePlanItem>;
} {
  const updated = items.map((item) => ({
    ...item,
    prereqs: prereqById[item.id] || [],
  }));
  return {
    items: updated,
    itemById: Object.fromEntries(updated.map((item) => [item.id, item])),
  };
}

export function solveSchedule(
  project: PlannerProjectV1,
  corpus: CorpusSnapshot,
  relationInfo: RelationInfo,
  difficultyModel: DifficultyModelSnapshot,
): SchedulePlan {
  const exclusionState = computeExclusionState(corpus, relationInfo, difficultyModel, project);
  const buildResult = buildScheduleItems(
    project,
    corpus,
    relationInfo,
    difficultyModel,
    exclusionState,
  );
  const schedulePrereqById = enforceBookOrderPrereqs(
    buildResult.activeIds,
    Object.fromEntries(buildResult.items.map((item) => [item.id, [...item.prereqs]])),
    project,
  );
  const { items, itemById } = applySchedulePrerequisites(
    buildResult.items,
    schedulePrereqById,
  );
  const orderedIds = scheduleOrder(buildResult.activeIds, items, schedulePrereqById, project);
  const scheduleRankById = Object.fromEntries(orderedIds.map((id, index) => [id, index]));
  const groups = buildScheduleGroups(
    project,
    buildResult.activeIds,
    itemById,
    relationInfo,
    orderedIds,
  );
  const laneCount = Math.max(1, Math.trunc(project.constraints.par || 2) || 2);
  const packingInput = {
    project,
    orderedGroups: groups.orderedGroups,
    itemById,
    groupLookup: groups.groupLookup,
    laneCount,
    scheduleRankById,
  };
  const packed =
    normalizeBackfillMode(project.constraints.backfillMode) === 'lane_preserving'
      ? packLanePreservingSchedule(packingInput)
      : packFlexibleSchedule(packingInput);
  const schedule = sortScheduleItems(packed.schedule);
  annotateLanePredecessors(schedule);

  return {
    items: schedule,
    byId: packed.byId,
    selectedAlgorithm: normalizeSchedAlgo(project.constraints.schedAlgo),
    prereqById: Object.fromEntries(schedule.map((entry) => [entry.id, [...entry.prereqs]])),
    graphPrereqsById: Object.fromEntries(
      buildResult.activeIds.map((id) => [
        id,
        (relationInfo.prereqById[id] || []).filter((parent) =>
          buildResult.activeIdSet.has(parent),
        ),
      ]),
    ),
    coStudyMeta: buildCoStudyMeta(schedule),
    exclusionState,
    groupSummary: groupBooks(schedule),
    activeIds: buildResult.activeIds,
    coStudyPairs: groups.coStudyPairs,
  };
}
