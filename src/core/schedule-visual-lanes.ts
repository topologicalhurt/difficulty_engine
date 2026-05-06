import { compareChain, compareNumberAsc, compareText } from './sort';
import type { SchedulePlanItem } from './types';

const VISUAL_LANE_REUSE_EPSILON = 1e-9;

export function packVisualLanes(entries: SchedulePlanItem[]): void {
  const laneEnds: number[] = [];
  [...entries]
    .sort((left, right) =>
      compareChain(
        compareNumberAsc(left.ds, right.ds),
        compareNumberAsc(left.de, right.de),
        compareNumberAsc(left.depth, right.depth),
        compareText(left.short, right.short),
      ),
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
