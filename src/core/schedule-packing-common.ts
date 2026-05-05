import type { ScheduleGroup } from './schedule-groups';
import { buildScheduleEntry } from './schedule-release';
import type { PlannerProjectV1, SchedulePlanItem } from './types';

export interface SchedulePackingInput {
  project: PlannerProjectV1;
  orderedGroups: ScheduleGroup[];
  itemById: Record<string, SchedulePlanItem>;
  groupLookup: Record<string, number>;
  laneCount: number;
  scheduleRankById: Record<string, number>;
}

export interface SchedulePackingResult {
  schedule: SchedulePlanItem[];
  byId: Record<string, SchedulePlanItem>;
}

export function groupMembers(
  group: ScheduleGroup,
  itemById: Record<string, SchedulePlanItem>,
): SchedulePlanItem[] {
  return group.ids
    .map((id) => itemById[id])
    .filter((item): item is SchedulePlanItem => Boolean(item));
}

function addEntry(
  result: SchedulePackingResult,
  entry: SchedulePlanItem,
): SchedulePlanItem {
  result.schedule.push(entry);
  result.byId[entry.id] = entry;
  return entry;
}

function scheduleRank(
  input: SchedulePackingInput,
  item: SchedulePlanItem,
): number {
  return input.scheduleRankById[item.id] ?? input.orderedGroups.length;
}

export function buildAndAddScheduleEntry(
  input: SchedulePackingInput,
  result: SchedulePackingResult,
  item: SchedulePlanItem,
  start: number,
  group: ScheduleGroup,
  batchIndex: number,
  batchSize: number,
  lane: number,
): SchedulePlanItem {
  return addEntry(
    result,
    buildScheduleEntry({
      item,
      start,
      days: item.plannedDays,
      group,
      batchIndex,
      batchSize,
      lane,
      laneCount: input.laneCount,
      project: input.project,
      scheduleRank: scheduleRank(input, item),
    }),
  );
}
