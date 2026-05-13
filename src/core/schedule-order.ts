import { bookOrderPolicy, compareBookPlanOrder } from './book-order';
import { normalizeSchedAlgo } from './constraint-normalizers';
import {
  topologicalOrder,
  weightedCriticalPathLengths,
} from './relation-graph-utils';
import type { PlannerProjectV1, SchedulePlanItem } from './types';
import { maxOr } from './utils';

function criticalPathLengths(
  ids: string[],
  items: SchedulePlanItem[],
  prereqById: Record<string, string[]>,
): Record<string, number> {
  const itemDays = Object.fromEntries(
    items.map((item) => [item.id, item.baseDays]),
  );
  return weightedCriticalPathLengths(ids, prereqById, itemDays);
}

function fastestListOrder(
  ids: string[],
  items: SchedulePlanItem[],
  prereqById: Record<string, string[]>,
  project: PlannerProjectV1,
): string[] {
  const itemMap = Object.fromEntries(items.map((item) => [item.id, item]));
  const orderFirst = bookOrderPolicy(project) !== 'auto';
  const memo = criticalPathLengths(ids, items, prereqById);
  const laneFree = Array.from(
    { length: Math.max(1, Math.trunc(project.constraints.par || 2) || 2) },
    () => 0,
  );
  const endById: Record<string, number> = {};
  const selected = new Set<string>();
  const order: string[] = [];

  while (order.length < ids.length) {
    const ready = ids
      .filter((id) => !selected.has(id))
      .filter((id) =>
        (prereqById[id] || []).every((parent) => selected.has(parent)),
      )
      .sort(
        (left, right) =>
          (orderFirst ? compareBookPlanOrder(project, left, right) : 0) ||
          (memo[right] || 0) - (memo[left] || 0) ||
          (itemMap[right]?.baseDays || 0) - (itemMap[left]?.baseDays || 0) ||
          (itemMap[right]?.depth || 0) - (itemMap[left]?.depth || 0) ||
          (itemMap[right]?.scheduleDifficulty || 0) -
            (itemMap[left]?.scheduleDifficulty || 0) ||
          left.localeCompare(right),
      );
    const next = ready[0] || ids.find((id) => !selected.has(id));
    if (!next) break;
    const lane = laneFree
      .map((free, index) => ({ free, index }))
      .sort(
        (left, right) => left.free - right.free || left.index - right.index,
      )[0];
    const prereqEnd = maxOr(
      (prereqById[next] || []).map((parent) => endById[parent] || 0),
      0,
    );
    const start = Math.max(lane?.free || 0, prereqEnd);
    const end = start + Math.max(1, itemMap[next]?.baseDays || 1);
    laneFree[lane?.index || 0] = end;
    endById[next] = end;
    selected.add(next);
    order.push(next);
  }

  return order;
}

export function scheduleOrder(
  ids: string[],
  items: SchedulePlanItem[],
  prereqById: Record<string, string[]>,
  project: PlannerProjectV1,
): string[] {
  const schedAlgo = normalizeSchedAlgo(project.constraints.schedAlgo);
  const order = topologicalOrder(ids, prereqById);
  const itemMap = Object.fromEntries(items.map((item) => [item.id, item]));
  const orderFirst = bookOrderPolicy(project) !== 'auto';
  const orderCompare = (left: string, right: string): number =>
    orderFirst ? compareBookPlanOrder(project, left, right) : 0;
  if (schedAlgo === 'balanced') {
    return [...order].sort(
      (left, right) =>
        orderCompare(left, right) ||
        itemMap[left].depth - itemMap[right].depth ||
        itemMap[right].baseDays - itemMap[left].baseDays ||
        left.localeCompare(right),
    );
  }
  if (schedAlgo === 'critical') {
    const memo = criticalPathLengths(ids, items, prereqById);
    return [...order].sort(
      (left, right) =>
        orderCompare(left, right) ||
        memo[right] - memo[left] ||
        itemMap[right].baseDays - itemMap[left].baseDays ||
        itemMap[right].depth - itemMap[left].depth ||
        left.localeCompare(right),
    );
  }
  if (schedAlgo === 'fastest')
    return fastestListOrder(ids, items, prereqById, project);
  return [...order].sort(
    (left, right) =>
      orderCompare(left, right) ||
      itemMap[left].depth - itemMap[right].depth ||
      itemMap[right].scheduleDifficulty - itemMap[left].scheduleDifficulty ||
      left.localeCompare(right),
  );
}
