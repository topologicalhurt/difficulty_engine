import {
  externalPrerequisiteEnd,
  requestedManualStart,
} from './schedule-release';
import {
  buildAndAddScheduleEntry,
  groupMembers,
  type SchedulePackingInput,
  type SchedulePackingResult,
} from './schedule-packing-common';
import { packVisualLanes } from './schedule-visual-lanes';
import type { SchedulePlanItem } from './types';

// Lane packing is the resource-capacity side of the RCPSP-like planner model:
// keep prerequisite release times and the parallel-book capacity separate from
// display lane assignment.
export function packLanePreservingSchedule(
  input: SchedulePackingInput,
): SchedulePackingResult {
  const result: SchedulePackingResult = { schedule: [], byId: {} };
  const lanes = Array.from({ length: input.laneCount }, () => 0);
  const chooseLanes = (
    count: number,
    prereqEnd: number,
    requestedStart: number,
    allowOverflow: boolean,
  ): { start: number; laneIds: number[] } => {
    if (allowOverflow && count > lanes.length) {
      while (lanes.length < count) lanes.push(0);
    }
    const picked = lanes
      .map((free, lane) => ({ free, lane }))
      .sort((left, right) => left.free - right.free || left.lane - right.lane)
      .slice(0, Math.max(1, count));
    const start = Math.max(
      prereqEnd,
      requestedStart,
      ...picked.map((entry) => entry.free),
    );
    return { start, laneIds: picked.map((entry) => entry.lane) };
  };

  input.orderedGroups.forEach((group) => {
    const members = groupMembers(group, input.itemById);
    if (!members.length) return;
    const strict =
      members.length > 1 &&
      (members.length <= input.laneCount ||
        input.project.constraints.mutualOversize === 'strict');
    if (!strict && members.length > input.laneCount) {
      for (
        let offset = 0, batch = 0;
        offset < members.length;
        offset += input.laneCount, batch += 1
      ) {
        const chunk = members.slice(offset, offset + input.laneCount);
        const prereqEnd = externalPrerequisiteEnd(
          chunk.map((item) => item.id),
          input.itemById,
          result.byId,
          input.groupLookup,
        );
        const picked = chooseLanes(
          chunk.length,
          prereqEnd,
          requestedManualStart(chunk),
          false,
        );
        chunk.forEach((item, index) => {
          const lane = picked.laneIds[index] || 0;
          const entry = buildAndAddScheduleEntry(
            input,
            result,
            item,
            Math.max(0, picked.start),
            group,
            batch,
            chunk.length,
            lane,
          );
          lanes[lane] = entry.de;
        });
      }
      return;
    }

    const prereqEnd = externalPrerequisiteEnd(
      group.ids,
      input.itemById,
      result.byId,
      input.groupLookup,
    );
    const picked = chooseLanes(
      members.length,
      prereqEnd,
      requestedManualStart(members),
      input.project.constraints.mutualOversize === 'strict',
    );
    members.forEach((item, index) => {
      const lane = picked.laneIds[index] || 0;
      const entry = buildAndAddScheduleEntry(
        input,
        result,
        item,
        Math.max(0, picked.start),
        group,
        0,
        members.length,
        lane,
      );
      lanes[lane] = entry.de;
    });
  });

  return result;
}

export function packFlexibleSchedule(
  input: SchedulePackingInput,
): SchedulePackingResult {
  const result: SchedulePackingResult = { schedule: [], byId: {} };

  input.orderedGroups.forEach((group) => {
    const members = groupMembers(group, input.itemById);
    if (!members.length) return;
    if (
      members.length > input.laneCount &&
      input.project.constraints.mutualOversize !== 'strict'
    ) {
      let batchStart = Math.max(
        0,
        externalPrerequisiteEnd(
          group.ids,
          input.itemById,
          result.byId,
          input.groupLookup,
        ),
        requestedManualStart(members),
      );
      for (
        let offset = 0, batch = 0;
        offset < members.length;
        offset += input.laneCount, batch += 1
      ) {
        const chunk = members.slice(offset, offset + input.laneCount);
        let batchEnd = batchStart;
        chunk.forEach((item) => {
          const entry = buildAndAddScheduleEntry(
            input,
            result,
            item,
            batchStart,
            group,
            batch,
            chunk.length,
            0,
          );
          batchEnd = Math.max(batchEnd, entry.de);
        });
        batchStart = batchEnd;
      }
      return;
    }

    const start = Math.max(
      0,
      externalPrerequisiteEnd(
        group.ids,
        input.itemById,
        result.byId,
        input.groupLookup,
      ),
      requestedManualStart(members),
    );
    members.forEach((item) => {
      buildAndAddScheduleEntry(
        input,
        result,
        item,
        start,
        group,
        0,
        members.length,
        0,
      );
    });
  });

  packVisualLanes(result.schedule);
  return result;
}

export function sortScheduleItems(
  schedule: SchedulePlanItem[],
): SchedulePlanItem[] {
  return [...schedule].sort(
    (left, right) =>
      left.ds - right.ds ||
      left.lane - right.lane ||
      left.depth - right.depth ||
      left.short.localeCompare(right.short),
  );
}

export function annotateLanePredecessors(schedule: SchedulePlanItem[]): void {
  const lanePrev: Record<string, string | null> = {};
  const laneTail: Record<number, SchedulePlanItem | undefined> = {};
  schedule.forEach((entry) => {
    lanePrev[entry.id] = laneTail[entry.lane]?.id || null;
    laneTail[entry.lane] = entry;
  });
  schedule.forEach((entry) => {
    entry.lanePrevId = lanePrev[entry.id] || null;
  });
}
