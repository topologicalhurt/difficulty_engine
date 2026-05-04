import { normalizeBookOrderPolicy } from './constraints';
import type { BookOrderPolicy, PlannerProjectV1 } from './types';

export function compareBookPlanOrder(
  project: PlannerProjectV1,
  leftId: string,
  rightId: string,
): number {
  const left = project.library.books[leftId];
  const right = project.library.books[rightId];
  const leftOwned = left?.owned === false ? 1 : 0;
  const rightOwned = right?.owned === false ? 1 : 0;
  return (
    leftOwned - rightOwned ||
    (left?.planOrder ?? Number.MAX_SAFE_INTEGER) - (right?.planOrder ?? Number.MAX_SAFE_INTEGER) ||
    (left?.short || left?.title || leftId).localeCompare(right?.short || right?.title || rightId) ||
    leftId.localeCompare(rightId)
  );
}

export function bookOrderPolicy(project: PlannerProjectV1): BookOrderPolicy {
  return normalizeBookOrderPolicy(project.constraints.bookOrderPolicy);
}

function reaches(
  from: string,
  target: string,
  prereqById: Record<string, string[]>,
  seen = new Set<string>(),
): boolean {
  if (from === target) return true;
  if (seen.has(from)) return false;
  seen.add(from);
  return Object.entries(prereqById).some(
    ([child, parents]) =>
      parents.includes(from) && reaches(child, target, prereqById, seen),
  );
}

export function enforceBookOrderPrereqs(
  ids: string[],
  prereqById: Record<string, string[]>,
  project: PlannerProjectV1,
): Record<string, string[]> {
  if (bookOrderPolicy(project) !== 'enforce') return prereqById;
  const ordered = [...ids].sort((left, right) => compareBookPlanOrder(project, left, right));
  const laneWidth = Math.max(1, Math.trunc(project.constraints.par || 1));
  const next = Object.fromEntries(
    ids.map((id) => [id, [...(prereqById[id] || [])]]),
  );
  ordered.forEach((id, index) => {
    const parent = ordered[index - laneWidth];
    if (!parent || next[id].includes(parent) || reaches(id, parent, next)) return;
    next[id] = [...next[id], parent];
  });
  return next;
}
