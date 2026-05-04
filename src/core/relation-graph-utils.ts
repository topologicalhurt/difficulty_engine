export function relationPairKey(from: string, to: string): string {
  return [from, to].sort().join('|');
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
  return (graph[from] || []).some((next) => hasDirectedPath(graph, next, to, new Set(seen)));
}

export function topologicalDepth(ids: string[], prereqById: Record<string, string[]>): Record<string, number> {
  const memo: Record<string, number> = {};

  function visit(id: string, seen: Set<string>): number {
    if (memo[id] != null) return memo[id];
    if (seen.has(id)) return 0;
    seen.add(id);
    const prereqs = (prereqById[id] || []).filter(Boolean);
    memo[id] = prereqs.length ? 1 + Math.max(...prereqs.map((next) => visit(next, new Set(seen)))) : 0;
    return memo[id];
  }

  ids.forEach((id) => visit(id, new Set()));
  return memo;
}
