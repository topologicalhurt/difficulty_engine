import type {
  AppState,
  BookRecord,
  OverlapClusterSummary,
  RelationEvidence,
} from '../../core/types';
import { compareChain, compareNumberAsc, compareText } from '../../core/sort';
import { memoizeSelector } from './memo';

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

export interface OverlapExplorerCluster {
  id: string;
  label: string;
  topicLabels: string[];
  bookIds: string[];
  overlapScore: number;
  timeSaved: number;
  confidence: number;
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
  overlapExplorer: {
    clusters: OverlapExplorerCluster[];
    bookRows: GraphBookNode[];
    emptyStateReason: string | null;
  };
  researchChains: ResearchChainView[];
}

interface VisibleGraphContext {
  ids: string[];
  set: Set<string>;
}

export function visibleGraphBookIds(state: GraphState): string[] {
  return Object.values(state.project.library.books)
    .filter((book) => !(state.project.constraints.excComp && book.completed))
    .sort((left, right) =>
      compareChain(
        compareText(left.short, right.short),
        compareText(left.id, right.id),
      ),
    )
    .map((book) => book.id);
}

function visibleGraphContext(state: GraphState): VisibleGraphContext {
  const ids = visibleGraphBookIds(state);
  return { ids, set: new Set(ids) };
}

function hasAlternatePath(
  from: string,
  to: string,
  adjacency: Record<string, string[]>,
  seen = new Set<string>(),
): boolean {
  if (seen.has(from)) return false;
  seen.add(from);
  return (adjacency[from] || []).some(
    (next) => next === to || hasAlternatePath(next, to, adjacency, seen),
  );
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

export function visiblePrerequisiteEdges(
  state: GraphState,
): RelationEvidence[] {
  const visibleIds = visibleGraphContext(state).set;
  return visiblePrerequisiteEdgesForSet(state, visibleIds);
}

function visiblePrerequisiteEdgesForSet(
  state: GraphState,
  visibleIds: ReadonlySet<string>,
): RelationEvidence[] {
  const edges = state.snapshot.relations
    .filter((relation) => relation.type === 'prerequisite')
    .filter(
      (relation) =>
        visibleIds.has(relation.from) && visibleIds.has(relation.to),
    )
    .sort((left, right) =>
      compareChain(
        compareText(left.from, right.from),
        compareText(left.to, right.to),
      ),
    );
  return state.project.constraints.tr ? transitiveReduction(edges) : edges;
}

export function visibleReferenceEdges(state: GraphState): RelationEvidence[] {
  const visibleIds = visibleGraphContext(state).set;
  return visibleReferenceEdgesForSet(state, visibleIds);
}

function visibleReferenceEdgesForSet(
  state: GraphState,
  visibleIds: ReadonlySet<string>,
): RelationEvidence[] {
  return state.snapshot.relations
    .filter((relation) => relation.type === 'reference')
    .filter(
      (relation) =>
        visibleIds.has(relation.from) && visibleIds.has(relation.to),
    );
}

export function visibleCoStudyEdges(state: GraphState): RelationEvidence[] {
  if (!state.project.constraints.mutualEnabled) return [];
  const visibleIds = visibleGraphContext(state).set;
  return visibleCoStudyEdgesForSet(state, visibleIds);
}

function visibleCoStudyEdgesForSet(
  state: GraphState,
  visibleIds: ReadonlySet<string>,
): RelationEvidence[] {
  if (!state.project.constraints.mutualEnabled) return [];
  return state.snapshot.relations
    .filter((relation) => relation.type === 'co-study')
    .filter(
      (relation) =>
        visibleIds.has(relation.from) && visibleIds.has(relation.to),
    );
}

export function visibleCoStudyGroups(
  state: GraphState,
): Array<{ id: string; ids: string[] }> {
  if (!state.project.constraints.mutualEnabled) return [];
  const visibleIds = visibleGraphContext(state).set;
  return visibleCoStudyGroupsForSet(state, visibleIds);
}

function visibleCoStudyGroupsForSet(
  state: GraphState,
  visibleIds: ReadonlySet<string>,
): Array<{ id: string; ids: string[] }> {
  if (!state.project.constraints.mutualEnabled) return [];
  return state.snapshot.coStudyMeta.groups
    .map((group) => ({
      id: group.id,
      ids: group.ids.filter((id) => visibleIds.has(id)),
    }))
    .filter((group) => group.ids.length > 1);
}

export function visibleOverlapClusters(
  state: GraphState,
): OverlapClusterSummary[] {
  const visibleIds = visibleGraphContext(state).set;
  return visibleOverlapClustersForSet(state, visibleIds);
}

function visibleOverlapClustersForSet(
  state: GraphState,
  visibleIds: ReadonlySet<string>,
): OverlapClusterSummary[] {
  return state.snapshot.overlapClusters
    .map((cluster) => ({
      ...cluster,
      bookIds: cluster.bookIds.filter((id) => visibleIds.has(id)),
      pruning: cluster.pruning.filter((entry) => visibleIds.has(entry.bookId)),
    }))
    .filter((cluster) => cluster.bookIds.length > 1);
}

function overlapExplorerClusters(
  state: GraphState,
  clusters: OverlapClusterSummary[],
): OverlapExplorerCluster[] {
  return clusters
    .map((cluster) => {
      const topicLabels = cluster.topicIds
        .map((id) => state.snapshot.topicsById[id]?.label ?? id)
        .slice(0, 6);
      const timeSaved = cluster.pruning.reduce(
        (sum, entry) => sum + entry.timeSaved,
        0,
      );
      const confidence = cluster.pruning.length
        ? cluster.pruning.reduce((sum, entry) => sum + entry.confidence, 0) /
          cluster.pruning.length
        : 0;
      return {
        id: cluster.id,
        label: topicLabels.slice(0, 3).join(', ') || cluster.id,
        topicLabels,
        bookIds: cluster.bookIds,
        overlapScore:
          cluster.bookIds.length * Math.max(1, cluster.topicIds.length),
        timeSaved,
        confidence,
      };
    })
    .sort((left, right) =>
      compareChain(
        compareNumberAsc(right.bookIds.length, left.bookIds.length),
        compareNumberAsc(right.topicLabels.length, left.topicLabels.length),
        compareText(left.label, right.label),
      ),
    );
}

export function visibleDisplayGroupPartitions(
  state: GraphState,
): DisplayGroupPartition[] {
  if (!state.project.constraints.part) return [];
  return visibleDisplayGroupPartitionsForIds(
    state,
    visibleGraphContext(state).ids,
  );
}

function visibleDisplayGroupPartitionsForIds(
  state: GraphState,
  visibleIds: readonly string[],
): DisplayGroupPartition[] {
  if (!state.project.constraints.part) return [];
  const groups: Record<string, string[]> = {};
  visibleIds.forEach((id) => {
    const book = state.project.library.books[id];
    const label = book?.displayGroup || 'Ungrouped';
    if (!groups[label]) groups[label] = [];
    groups[label].push(id);
  });
  return Object.entries(groups)
    .map(([label, ids]) => ({ label, ids }))
    .sort((left, right) => compareText(left.label, right.label));
}

const selectGraphRenderModelMemo = memoizeSelector(
  'graph.renderModel',
  (state: AppState) => [state.project, state.snapshot],
  (state: AppState): GraphRenderModel => {
    const visible = visibleGraphContext(state);
    const nodes = state.snapshot.sortedBooks
      .slice()
      .filter((book) => visible.set.has(book.id))
      .sort((left, right) =>
        compareChain(
          compareNumberAsc(left.dep, right.dep),
          compareText(left.short, right.short),
          compareText(left.id, right.id),
        ),
      )
      .map((book) => ({
        id: book.id,
        short: book.short,
        title: book.title,
        displayGroup: book.displayGroup,
        dep: book.dep,
      }));
    const overlapClusters = visibleOverlapClustersForSet(state, visible.set);
    const overlapExplorer = {
      clusters: overlapExplorerClusters(state, overlapClusters),
      bookRows: nodes,
      emptyStateReason: overlapClusters.length
        ? null
        : 'No strong shared-topic intersections are available for the current graph filters.',
    };
    return {
      visibleIds: visible.ids,
      nodes,
      books: visible.ids
        .map((id) => state.project.library.books[id])
        .filter(Boolean),
      prerequisiteEdges: visiblePrerequisiteEdgesForSet(state, visible.set),
      coStudyEdges: visibleCoStudyEdgesForSet(state, visible.set),
      referenceEdges: visibleReferenceEdgesForSet(state, visible.set),
      coStudyGroups: visibleCoStudyGroupsForSet(state, visible.set),
      displayGroupPartitions: visibleDisplayGroupPartitionsForIds(
        state,
        visible.ids,
      ),
      overlapClusters,
      overlapExplorer,
      researchChains: state.snapshot.schedulePlan.exclusionState.rdChains.map(
        (chain) => ({
          ids: chain.ids,
          label: chain.label,
        }),
      ),
    };
  },
);

export function selectGraphRenderModel(state: AppState): GraphRenderModel {
  return selectGraphRenderModelMemo(state);
}
