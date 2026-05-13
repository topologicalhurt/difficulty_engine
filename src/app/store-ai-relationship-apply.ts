import { hasDirectedPath } from '../core/relation-graph-utils';
import type {
  AiRelationshipEdgeProposal,
  AiRelationshipProposal,
  BookRecord,
  PlannerProjectV1,
} from '../core/types';

export interface AiRelationshipApplyResult {
  project: PlannerProjectV1;
  changedBookIds: string[];
}

function cloneRelationshipBook(book: BookRecord): BookRecord {
  return {
    ...book,
    authors: [...book.authors],
    subjects: [...book.subjects],
    manualPrereqs: [...book.manualPrereqs],
    manualCoStudy: [...book.manualCoStudy],
    enrichment: {
      ...book.enrichment,
      chapters: [...book.enrichment.chapters],
      olSubjects: [...book.enrichment.olSubjects],
    },
  };
}

function orderedStageIds(proposal: AiRelationshipProposal): string[] {
  return proposal.stages
    .flatMap((stage) => stage.bookIds)
    .filter((id, index, ids) => ids.indexOf(id) === index);
}

function applyPlanOrder(
  books: Record<string, BookRecord>,
  proposal: AiRelationshipProposal,
): void {
  const staged = orderedStageIds(proposal);
  const orderedIds = [
    ...staged,
    ...Object.values(books)
      .filter((book) => !staged.includes(book.id))
      .sort(
        (left, right) =>
          left.planOrder - right.planOrder || left.title.localeCompare(right.title),
      )
      .map((book) => book.id),
  ];
  orderedIds.forEach((id, index) => {
    const book = books[id];
    if (book) book.planOrder = index;
  });
}

function proposedPrereqs(
  proposal: AiRelationshipProposal,
): AiRelationshipEdgeProposal[] {
  return proposal.relations
    .filter((edge) => edge.type === 'prerequisite')
    .sort(
      (left, right) =>
        right.confidence - left.confidence ||
        left.from.localeCompare(right.from) ||
        left.to.localeCompare(right.to),
    );
}

function addPrerequisiteEdges(
  books: Record<string, BookRecord>,
  proposal: AiRelationshipProposal,
  preserveManualRelations: boolean,
): void {
  const graph: Record<string, string[]> = Object.fromEntries(
    Object.keys(books).map((id) => [id, []]),
  );
  Object.values(books).forEach((book) => {
    if (!preserveManualRelations) book.manualPrereqs = [];
    book.manualPrereqs = book.manualPrereqs.filter((id) => Boolean(books[id]));
    book.manualPrereqs.forEach((parent) => graph[parent]?.push(book.id));
  });
  proposedPrereqs(proposal).forEach((edge) => {
    if (!books[edge.from] || !books[edge.to]) return;
    if (hasDirectedPath(graph, edge.to, edge.from)) return;
    const prereqs = new Set(books[edge.to]?.manualPrereqs ?? []);
    prereqs.add(edge.from);
    books[edge.to].manualPrereqs = [...prereqs].sort();
    graph[edge.from] = [...(graph[edge.from] ?? []), edge.to];
  });
}

function prerequisiteGraph(
  books: Record<string, BookRecord>,
): Record<string, string[]> {
  const graph: Record<string, string[]> = Object.fromEntries(
    Object.keys(books).map((id) => [id, []]),
  );
  Object.values(books).forEach((book) => {
    book.manualPrereqs.forEach((parent) => graph[parent]?.push(book.id));
  });
  return graph;
}

function addCoStudyEdges(
  books: Record<string, BookRecord>,
  proposal: AiRelationshipProposal,
  preserveManualRelations: boolean,
): void {
  Object.values(books).forEach((book) => {
    if (!preserveManualRelations) book.manualCoStudy = [];
    book.manualCoStudy = book.manualCoStudy.filter((id) => Boolean(books[id]));
  });
  const graph = prerequisiteGraph(books);
  proposal.relations
    .filter((edge) => edge.type === 'co-study')
    .forEach((edge) => {
      const from = books[edge.from];
      const to = books[edge.to];
      if (!from || !to) return;
      if (
        hasDirectedPath(graph, from.id, to.id) ||
        hasDirectedPath(graph, to.id, from.id)
      ) {
        return;
      }
      from.manualCoStudy = [...new Set([...from.manualCoStudy, to.id])].sort();
      to.manualCoStudy = [...new Set([...to.manualCoStudy, from.id])].sort();
    });
}

export function applyAiRelationshipProposalToProject(
  project: PlannerProjectV1,
  proposal: AiRelationshipProposal,
): AiRelationshipApplyResult {
  const books = Object.fromEntries(
    Object.entries(project.library.books).map(([id, book]) => [
      id,
      cloneRelationshipBook(book),
    ]),
  );
  const preserveManualRelations =
    proposal.wizard.strictness !== 'rebuild_from_scratch' &&
    (proposal.wizard.preserveManualRelations ||
      proposal.wizard.strictness === 'preserve_existing');
  applyPlanOrder(books, proposal);
  addPrerequisiteEdges(books, proposal, preserveManualRelations);
  addCoStudyEdges(books, proposal, preserveManualRelations);
  const changedBookIds = Object.keys(books).filter(
    (id) => JSON.stringify(books[id]) !== JSON.stringify(project.library.books[id]),
  );
  return {
    project: {
      ...project,
      library: { books },
    },
    changedBookIds,
  };
}
