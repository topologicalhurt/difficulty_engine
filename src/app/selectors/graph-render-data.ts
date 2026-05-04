import type {
  AppState,
  BookRecord,
  OverlapClusterSummary,
  RelationEvidence,
} from '../../core/types';

type GraphState = Pick<AppState, 'project' | 'snapshot'>;

export interface DisplayGroupPartition {
  label: string;
  ids: string[];
}

export interface GraphBookNode {
  id: string;
  short: string;
  title: string;
  displayGroup: string;
  dep: number;
}

export interface ResearchChainView {
  ids: string[];
  label: string;
}

export interface GraphRenderModel {
  visibleIds: string[];
  nodes: GraphBookNode[];
  books: BookRecord[];
  prerequisiteEdges: RelationEvidence[];
  coStudyEdges: RelationEvidence[];
  referenceEdges: RelationEvidence[];
  coStudyGroups: Array<{ id: string; ids: string[] }>;
  displayGroupPartitions: DisplayGroupPartition[];
  overlapClusters: OverlapClusterSummary[];
  researchChains: ResearchChainView[];
}

export function visibleGraphBookIds(state: GraphState): string[] {
  return Object.values(state.project.library.books)
    .filter((book) => !(state.project.constraints.excComp && book.completed))
    .sort((left, right) => left.short.localeCompare(right.short))
    .map((book) => book.id);
}

function hasAlternatePath(
  from: string,
  to: string,
  adjacency: Record<string, string[]>,
  seen = new Set<string>(),
): boolean {
  if (seen.has(from)) return false;
  seen.add(from);
  return (adjacency[from] || []).some((next) => next === to || hasAlternatePath(next, to, adjacency, seen));
}

function transitiveReduction(edges: RelationEvidence[]): RelationEvidence[] {
  const adjacency: Record<string, string[]> = {};
  edges.forEach((edge) => {
    if (!adjacency[edge.from]) adjacency[edge.from] = [];
    adjacency[edge.from].push(edge.to);
  });
  return edges.filter((edge) => {
    const adjacencyWithoutEdge = {
      ...adjacency,
      [edge.from]: (adjacency[edge.from] || []).filter((id) => id !== edge.to),
    };
    return !hasAlternatePath(edge.from, edge.to, adjacencyWithoutEdge);
  });
}

export function visiblePrerequisiteEdges(state: GraphState): RelationEvidence[] {
  const visibleIds = new Set(visibleGraphBookIds(state));
  const edges = state.snapshot.relations
    .filter((relation) => relation.type === 'prerequisite')
    .filter((relation) => visibleIds.has(relation.from) && visibleIds.has(relation.to))
    .sort((left, right) => left.from.localeCompare(right.from) || left.to.localeCompare(right.to));
  return state.project.constraints.tr ? transitiveReduction(edges) : edges;
}

export function visibleReferenceEdges(state: GraphState): RelationEvidence[] {
  const visibleIds = new Set(visibleGraphBookIds(state));
  return state.snapshot.relations
    .filter((relation) => relation.type === 'reference')
    .filter((relation) => visibleIds.has(relation.from) && visibleIds.has(relation.to));
}

export function visibleCoStudyEdges(state: GraphState): RelationEvidence[] {
  if (!state.project.constraints.mutualEnabled) return [];
  const visibleIds = new Set(visibleGraphBookIds(state));
  return state.snapshot.relations
    .filter((relation) => relation.type === 'co-study')
    .filter((relation) => visibleIds.has(relation.from) && visibleIds.has(relation.to));
}

export function visibleCoStudyGroups(state: GraphState): Array<{ id: string; ids: string[] }> {
  if (!state.project.constraints.mutualEnabled) return [];
  const visibleIds = new Set(visibleGraphBookIds(state));
  return state.snapshot.coStudyMeta.groups
    .map((group) => ({ id: group.id, ids: group.ids.filter((id) => visibleIds.has(id)) }))
    .filter((group) => group.ids.length > 1);
}

export function visibleOverlapClusters(state: GraphState): OverlapClusterSummary[] {
  const visibleIds = new Set(visibleGraphBookIds(state));
  return state.snapshot.overlapClusters
    .map((cluster) => ({
      ...cluster,
      bookIds: cluster.bookIds.filter((id) => visibleIds.has(id)),
      pruning: cluster.pruning.filter((entry) => visibleIds.has(entry.bookId)),
    }))
    .filter((cluster) => cluster.bookIds.length > 1);
}

export function visibleDisplayGroupPartitions(state: GraphState): DisplayGroupPartition[] {
  if (!state.project.constraints.part) return [];
  const groups: Record<string, string[]> = {};
  visibleGraphBookIds(state).forEach((id) => {
    const book = state.project.library.books[id];
    const label = book?.displayGroup || 'Ungrouped';
    if (!groups[label]) groups[label] = [];
    groups[label].push(id);
  });
  return Object.entries(groups)
    .map(([label, ids]) => ({ label, ids }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function selectGraphRenderModel(state: AppState): GraphRenderModel {
  const visibleIds = visibleGraphBookIds(state);
  const visibleSet = new Set(visibleIds);
  const nodes = state.snapshot.sortedBooks
    .slice()
    .filter((book) => visibleSet.has(book.id))
    .sort((left, right) => left.dep - right.dep || left.short.localeCompare(right.short))
    .map((book) => ({
      id: book.id,
      short: book.short,
      title: book.title,
      displayGroup: book.displayGroup,
      dep: book.dep,
    }));
  return {
    visibleIds,
    nodes,
    books: visibleIds.map((id) => state.project.library.books[id]).filter(Boolean),
    prerequisiteEdges: visiblePrerequisiteEdges(state),
    coStudyEdges: visibleCoStudyEdges(state),
    referenceEdges: visibleReferenceEdges(state),
    coStudyGroups: visibleCoStudyGroups(state),
    displayGroupPartitions: visibleDisplayGroupPartitions(state),
    overlapClusters: visibleOverlapClusters(state),
    researchChains: state.snapshot.schedulePlan.exclusionState.rdChains.map((chain) => ({
      ids: chain.ids,
      label: chain.label,
    })),
  };
}
