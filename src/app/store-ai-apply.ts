import { findMatchingBook } from '../core/book-identity';
import { EXAMPLE_BOOK } from '../core/defaults';
import type {
  AiRecommendationProposal,
  AiRecommendedBook,
  BookRecord,
  PlannerProjectV1,
} from '../core/types';
import { nextBookId } from './store-helpers';

export interface AiProposalApplyResult {
  project: PlannerProjectV1;
  addedIds: string[];
  removedIds: string[];
  skippedTitles: string[];
  reordered: boolean;
}

export function hasApplicableAiProposal(
  proposal: AiRecommendationProposal | null,
): proposal is AiRecommendationProposal {
  return Boolean(
    proposal &&
      (proposal.books.length ||
        proposal.removeBookIds.length ||
        proposal.bookOrder.length),
  );
}

function shortLabel(title: string): string {
  return title.length <= 22 ? title : `${title.slice(0, 19).trimEnd()}...`;
}

function bookFromProposal(
  id: string,
  proposal: AiRecommendedBook,
  planOrder: number,
): BookRecord {
  return {
    ...EXAMPLE_BOOK,
    id,
    title: proposal.title,
    short: shortLabel(proposal.title),
    authors: proposal.authors,
    displayGroup: proposal.displayGroup,
    manualSeedDifficulty: proposal.manualSeedDifficulty,
    pages: proposal.pages ?? 250,
    subjects: proposal.subjects,
    isbn: proposal.isbn,
    manualPrereqs: [],
    manualCoStudy: [],
    planOrder,
    enrichment: {
      chapters: [],
      description: proposal.rationale,
      olSubjects: proposal.subjects,
      tocSource: 'none',
    },
  };
}

function nextIds(project: PlannerProjectV1, count: number): string[] {
  const ids: string[] = [];
  let working = project;
  for (let index = 0; index < count; index += 1) {
    const id = nextBookId(working);
    ids.push(id);
    working = {
      ...working,
      library: {
        books: {
          ...working.library.books,
          [id]: { ...EXAMPLE_BOOK, id },
        },
      },
    };
  }
  return ids;
}

function nextPlanOrder(books: Record<string, BookRecord>): number {
  return Math.max(-1, ...Object.values(books).map((book) => book.planOrder)) + 1;
}

function safeRemoveIds(
  project: PlannerProjectV1,
  proposal: AiRecommendationProposal,
): string[] {
  const existing = project.library.books;
  return Array.from(
    new Set(proposal.removeBookIds.filter((id) => Boolean(existing[id]))),
  );
}

function cleanupRemovedRelationRefs(
  books: Record<string, BookRecord>,
  removedIds: Set<string>,
): Record<string, BookRecord> {
  if (!removedIds.size) return books;
  const validIds = new Set(Object.keys(books));
  const nextBooks = { ...books };
  Object.values(books).forEach((book) => {
    const manualPrereqs = book.manualPrereqs.filter(
      (id) => validIds.has(id) && !removedIds.has(id),
    );
    const manualCoStudy = book.manualCoStudy.filter(
      (id) => validIds.has(id) && !removedIds.has(id),
    );
    if (
      manualPrereqs.length !== book.manualPrereqs.length ||
      manualCoStudy.length !== book.manualCoStudy.length
    ) {
      nextBooks[book.id] = {
        ...book,
        manualPrereqs,
        manualCoStudy,
      };
    }
  });
  return nextBooks;
}

function applyBookOrder(
  books: Record<string, BookRecord>,
  orderRefs: string[],
  refLookup: Map<string, string>,
): { books: Record<string, BookRecord>; reordered: boolean } {
  if (!orderRefs.length) return { books, reordered: false };
  const seen = new Set<string>();
  const orderedIds: string[] = [];
  orderRefs.forEach((ref) => {
    const id = refLookup.get(ref) ?? ref;
    if (!books[id] || seen.has(id)) return;
    seen.add(id);
    orderedIds.push(id);
  });
  const remainingIds = Object.values(books)
    .filter((book) => !seen.has(book.id))
    .sort(
      (left, right) =>
        left.planOrder - right.planOrder || left.title.localeCompare(right.title),
    )
    .map((book) => book.id);
  const allIds = [...orderedIds, ...remainingIds];
  let reordered = false;
  const nextBooks = { ...books };
  allIds.forEach((id, planOrder) => {
    if (nextBooks[id]?.planOrder === planOrder) return;
    nextBooks[id] = { ...nextBooks[id], planOrder };
    reordered = true;
  });
  return { books: nextBooks, reordered };
}

export function applyAiProposalToProject(
  project: PlannerProjectV1,
  proposal: AiRecommendationProposal,
): AiProposalApplyResult {
  const existingBookIds = new Set(Object.keys(project.library.books));
  const refLookup = new Map<string, string>();
  const candidateIds = nextIds(project, proposal.books.length);
  const removedIds = safeRemoveIds(project, proposal);
  const removedIdSet = new Set(removedIds);
  let books: Record<string, BookRecord> = Object.fromEntries(
    Object.entries(project.library.books).filter(([id]) => !removedIdSet.has(id)),
  );
  const addedIds: string[] = [];
  const skippedTitles: string[] = [];

  proposal.books.forEach((bookProposal) => {
    const existing = findMatchingBook({ library: { books } }, bookProposal);
    if (existing) {
      refLookup.set(bookProposal.proposalId, existing.id);
      skippedTitles.push(bookProposal.title);
      return;
    }
    const id = candidateIds[addedIds.length];
    refLookup.set(bookProposal.proposalId, id);
    existingBookIds.forEach((existingId) => refLookup.set(existingId, existingId));
    books[id] = bookFromProposal(id, bookProposal, nextPlanOrder(books));
    addedIds.push(id);
  });

  books = cleanupRemovedRelationRefs(books, removedIdSet);
  const ordered = applyBookOrder(books, proposal.bookOrder, refLookup);
  books = ordered.books;

  return {
    project: {
      ...project,
      library: { books },
    },
    addedIds,
    removedIds,
    skippedTitles,
    reordered: ordered.reordered,
  };
}
