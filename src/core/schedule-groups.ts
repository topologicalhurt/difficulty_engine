import type { RelationInfo } from './internal-types';
import { coStudyComponents } from './schedule-components';
import type { PlannerProjectV1, SchedulePlan, SchedulePlanItem } from './types';
import { minOr } from './utils';

export const MISSING_GROUP_ORDER = 9999;

export interface ScheduleGroup {
  id: string;
  ids: string[];
  order?: number;
}

export interface ScheduleGroupBuildResult {
  coStudyPairs: Array<[string, string]>;
  groups: ScheduleGroup[];
  groupLookup: Record<string, number>;
  orderedGroups: Array<ScheduleGroup & { order: number }>;
}

function buildCoStudyPairs(
  project: PlannerProjectV1,
  relationInfo: RelationInfo,
  itemById: Record<string, SchedulePlanItem>,
): Array<[string, string]> {
  if (project.constraints.mutualEnabled === false) return [];
  return relationInfo.coStudyPairs.filter(
    ([left, right]) => Boolean(itemById[left]) && Boolean(itemById[right]),
  );
}

function buildLookup(groups: ScheduleGroup[]): Record<string, number> {
  const groupLookup: Record<string, number> = {};
  groups.forEach((group, index) => {
    group.ids.forEach((id) => {
      groupLookup[id] = index;
    });
  });
  return groupLookup;
}

export function buildScheduleGroups(
  project: PlannerProjectV1,
  activeIds: string[],
  itemById: Record<string, SchedulePlanItem>,
  relationInfo: RelationInfo,
  orderedIds: string[],
): ScheduleGroupBuildResult {
  const coStudyPairs = buildCoStudyPairs(project, relationInfo, itemById);
  const groups = coStudyComponents(activeIds, coStudyPairs).map(
    (ids, index) => ({
      id: `g${index}`,
      ids: [...ids].sort(
        (left, right) =>
          itemById[left].depth - itemById[right].depth ||
          left.localeCompare(right),
      ),
    }),
  );
  const groupLookup = buildLookup(groups);
  const orderIndexById = new Map(orderedIds.map((id, index) => [id, index]));
  const orderedGroups = groups
    .map((group) => ({
      ...group,
      order: minOr(
        group.ids
          .map((id) => orderIndexById.get(id) ?? MISSING_GROUP_ORDER)
          .filter((position) => position >= 0),
        MISSING_GROUP_ORDER,
      ),
    }))
    .sort(
      (left, right) =>
        left.order - right.order || left.id.localeCompare(right.id),
    );

  return {
    coStudyPairs,
    groups,
    groupLookup,
    orderedGroups,
  };
}

export function buildCoStudyMeta(
  schedule: SchedulePlanItem[],
): SchedulePlan['coStudyMeta'] {
  const byGroup: Record<string, string[]> = {};
  schedule.forEach((entry) => {
    if (!entry.coStudyGroup) return;
    if (!byGroup[entry.coStudyGroup]) byGroup[entry.coStudyGroup] = [];
    byGroup[entry.coStudyGroup].push(entry.id);
  });

  return {
    groups: Object.entries(byGroup).map(([id, ids]) => ({ id, ids: [...ids] })),
    lookup: Object.fromEntries(
      schedule
        .filter((entry) => entry.coStudyGroup)
        .map((entry) => [entry.id, entry.coStudyGroup || '']),
    ),
  };
}
