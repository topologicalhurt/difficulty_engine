import type { BookRecord, PlannerProjectV1 } from '../core/types';
import { unique } from '../core/utils';

export interface BookRelationPatch {
  manualPrereqs?: string[];
  manualDependents?: string[];
  manualCoStudy?: string[];
}

function validLinkedIds(
  project: PlannerProjectV1,
  sourceId: string,
  ids: string[],
): string[] {
  return unique(ids)
    .filter((id) => id !== sourceId && Boolean(project.library.books[id]))
    .sort();
}

function cloneBook(book: BookRecord): BookRecord {
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
      provenance: book.enrichment.provenance
        ? { ...book.enrichment.provenance }
        : undefined,
    },
  };
}

export function withBookRelationPatch(
  project: PlannerProjectV1,
  sourceId: string,
  patch: BookRelationPatch,
): PlannerProjectV1 {
  if (!project.library.books[sourceId]) return project;
  const books = Object.fromEntries(
    Object.entries(project.library.books).map(([id, book]) => [
      id,
      cloneBook(book),
    ]),
  );
  const source = books[sourceId];
  if (!source) return project;

  if (patch.manualPrereqs) {
    source.manualPrereqs = validLinkedIds(
      project,
      sourceId,
      patch.manualPrereqs,
    );
  }

  if (patch.manualDependents) {
    const selected = new Set(
      validLinkedIds(project, sourceId, patch.manualDependents),
    );
    Object.values(books).forEach((book) => {
      if (book.id === sourceId) return;
      const prereqs = new Set(
        book.manualPrereqs.filter((id) => id !== sourceId),
      );
      if (selected.has(book.id)) prereqs.add(sourceId);
      book.manualPrereqs = [...prereqs]
        .filter((id) => Boolean(books[id]))
        .sort();
    });
  }

  if (patch.manualCoStudy) {
    const selected = new Set(
      validLinkedIds(project, sourceId, patch.manualCoStudy),
    );
    source.manualCoStudy = [...selected];
    Object.values(books).forEach((book) => {
      if (book.id === sourceId) return;
      const coStudy = new Set(
        book.manualCoStudy.filter((id) => id !== sourceId),
      );
      if (selected.has(book.id)) coStudy.add(sourceId);
      book.manualCoStudy = [...coStudy]
        .filter((id) => Boolean(books[id]))
        .sort();
    });
  }

  return {
    ...project,
    library: { books },
  };
}
