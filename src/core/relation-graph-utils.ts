export function relationPairKey(from: string, to: string): string {
  return [from, to].sort().join('|');
}

export function prerequisiteChildMap(
  ids: string[],
  prereqById: Record<string, string[]>,
): Record<string, string[]> {
  const children: Record<string, string[]> = {};
  ids.forEach((id) => {
    children[id] = [];
  });
  ids.forEach((id) => {
    (prereqById[id] || []).forEach((parent) => {
      if (children[parent]) children[parent].push(id);
    });
  });
  return children;
}

export function topologicalOrder(
  ids: string[],
  prereqById: Record<string, string[]>,
): string[] {
  const indegree: Record<string, number> = {};
  const outgoing = prerequisiteChildMap(ids, prereqById);
  ids.forEach((id) => {
    indegree[id] = 0;
  });
  ids.forEach((id) => {
    (prereqById[id] || []).forEach((parent) => {
      if (indegree[id] != null && outgoing[parent]) indegree[id] += 1;
    });
  });
  const queue = ids.filter((id) => indegree[id] === 0).sort();
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift();
    if (!id) break;
    order.push(id);
    outgoing[id].forEach((next) => {
      indegree[next] -= 1;
      if (indegree[next] === 0) {
        queue.push(next);
        queue.sort();
      }
    });
  }
  const ordered = new Set(order);
  ids
    .filter((id) => !ordered.has(id))
    .sort()
    .forEach((id) => order.push(id));
  return order;
}

export function weightedCriticalPathLengths(
  ids: string[],
  prereqById: Record<string, string[]>,
  weightById: Record<string, number>,
): Record<string, number> {
  const children = prerequisiteChildMap(ids, prereqById);
  const memo: Record<string, number> = {};
  function visit(id: string): number {
    if (memo[id] != null) return memo[id];
    const childIds = children[id] || [];
    memo[id] =
      (weightById[id] || 1) +
      (childIds.length
        ? Math.max(...childIds.map((childId) => visit(childId)))
        : 0);
    return memo[id];
  }
  ids.forEach((id) => {
    visit(id);
  });
  return memo;
}

export function hasDirectedPath(
  graph: Record<string, string[]>,
  from: string,
  to: string,
  seen = new Set<string>(),
): boolean {
  if (from === to) return true;
  if (seen.has(from)) return false;
  seen.add(from);
  return (graph[from] || []).some((next) =>
    hasDirectedPath(graph, next, to, new Set(seen)),
  );
}

export function topologicalDepth(
  ids: string[],
  prereqById: Record<string, string[]>,
): Record<string, number> {
  const memo: Record<string, number> = {};

  function visit(id: string, seen: Set<string>): number {
    if (memo[id] != null) return memo[id];
    if (seen.has(id)) return 0;
    seen.add(id);
    const prereqs = (prereqById[id] || []).filter(Boolean);
    memo[id] = prereqs.length
      ? 1 + Math.max(...prereqs.map((next) => visit(next, new Set(seen))))
      : 0;
    return memo[id];
  }

  ids.forEach((id) => visit(id, new Set()));
  return memo;
}
