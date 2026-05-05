import { relationReferenceTargets } from '../core/ai-recommendations';
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
  skippedTitles: string[];
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
    authors: proposal.authors.length ? proposal.authors : EXAMPLE_BOOK.authors,
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

function resolveRelationRefs(
  refIds: string[],
  refLookup: Map<string, string>,
  ownId: string,
): string[] {
  return Array.from(
    new Set(
      refIds
        .map((ref) => refLookup.get(ref) ?? ref)
        .filter((id) => id && id !== ownId),
    ),
  ).sort();
}

export function applyAiProposalToProject(
  project: PlannerProjectV1,
  proposal: AiRecommendationProposal,
): AiProposalApplyResult {
  const existingBookIds = new Set(Object.keys(project.library.books));
  const refLookup = new Map<string, string>();
  const candidateIds = nextIds(project, proposal.books.length);
  const books = { ...project.library.books };
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
    relationReferenceTargets(bookProposal).forEach((ref) => {
      if (existingBookIds.has(ref)) refLookup.set(ref, ref);
    });
    books[id] = bookFromProposal(id, bookProposal, Object.keys(books).length);
    addedIds.push(id);
  });

  proposal.books.forEach((bookProposal) => {
    const id = refLookup.get(bookProposal.proposalId);
    if (!id || !books[id]) return;
    books[id] = {
      ...books[id],
      manualPrereqs: resolveRelationRefs(
        bookProposal.prerequisiteIds,
        refLookup,
        id,
      ),
      manualCoStudy: resolveRelationRefs(
        bookProposal.coStudyIds,
        refLookup,
        id,
      ),
    };
  });

  return {
    project: {
      ...project,
      library: { books },
    },
    addedIds,
    skippedTitles,
  };
}
