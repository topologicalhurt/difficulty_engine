import type { ScheduleGroup } from './schedule-groups';
import type { PlannerProjectV1, SchedulePlanItem } from './types';
import { maxOr } from './utils';

export function externalPrerequisiteEnd(
  ids: string[],
  itemById: Record<string, SchedulePlanItem>,
  scheduledById: Record<string, SchedulePlanItem>,
  groupLookup: Record<string, number>,
): number {
  let end = 0;
  ids.forEach((id) => {
    const item = itemById[id];
    if (!item) return;
    item.prereqs.forEach((parent) => {
      if (groupLookup[parent] === groupLookup[id]) return;
      end = Math.max(end, scheduledById[parent]?.de || 0);
    });
  });
  return end;
}

export function requestedManualStart(items: SchedulePlanItem[]): number {
  return maxOr(
    items.map((item) =>
      item.manual.ds != null ? Math.max(0, Math.round(item.manual.ds)) : 0,
    ),
    0,
  );
}

interface BuildScheduleEntryInput {
  item: SchedulePlanItem;
  start: number;
  days: number;
  group: ScheduleGroup;
  batchIndex: number;
  batchSize: number;
  lane: number;
  laneCount: number;
  project: PlannerProjectV1;
  scheduleRank: number;
}

export function buildScheduleEntry(
  input: BuildScheduleEntryInput,
): SchedulePlanItem {
  const {
    item,
    start,
    days,
    group,
    batchIndex,
    batchSize,
    lane,
    laneCount,
    project,
    scheduleRank,
  } = input;
  const splitOversizeGroup =
    group.ids.length > laneCount &&
    project.constraints.mutualOversize !== 'strict';
  const coStudyGroup =
    group.ids.length > 1
      ? splitOversizeGroup
        ? `${group.id}:batch${batchIndex}`
        : group.id
      : null;
  const manualStart =
    item.manual.ds != null ? Math.max(0, Math.round(item.manual.ds)) : null;
  const manualWindowImpossibleReason =
    manualStart != null && start !== manualStart
      ? item.manualWindowImpossibleReason ||
        `${item.short} cannot honor the manual start window under the current prerequisite and lane constraints.`
      : item.manualWindowImpossibleReason;

  return {
    ...item,
    lane,
    releaseSlot: start,
    targetWindow: { start, end: start + days },
    targetWindowStart: start,
    targetWindowEnd: start + days,
    coStudyGroup,
    ds: start,
    de: start + days,
    plannedDays: days,
    wks: days / Math.max(1, project.constraints.dpw),
    mutualBatchIndex: batchIndex,
    coStudyGroupSize: coStudyGroup ? batchSize : 1,
    manualWindowImpossibleReason,
    scheduleRank,
  };
}
