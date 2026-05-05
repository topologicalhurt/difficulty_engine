import type { SchedulePlanItem } from './types';

const VISUAL_LANE_REUSE_EPSILON = 1e-9;

export function packVisualLanes(entries: SchedulePlanItem[]): void {
  const laneEnds: number[] = [];
  [...entries]
    .sort(
      (left, right) =>
        left.ds - right.ds ||
        left.de - right.de ||
        left.depth - right.depth ||
        left.short.localeCompare(right.short),
    )
    .forEach((entry) => {
      let lane = laneEnds.findIndex(
        (end) => end <= entry.ds + VISUAL_LANE_REUSE_EPSILON,
      );
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = entry.de;
      entry.lane = lane;
    });
}
