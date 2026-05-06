import type { BookRecord } from './types';
import { unique } from './utils';

function validRelationIds(
  ids: string[],
  sourceId: string,
  validIds: Set<string>,
): string[] {
  return unique(ids)
    .filter((id) => id !== sourceId && validIds.has(id))
    .sort();
}

export function normalizeBookRelations(
  books: Record<string, BookRecord>,
  validIds: Set<string>,
): Record<string, BookRecord> {
  const normalized = Object.fromEntries(
    Object.entries(books).map(([id, book]) => [
      id,
      {
        ...book,
        manualPrereqs: validRelationIds(book.manualPrereqs, id, validIds),
        manualCoStudy: validRelationIds(book.manualCoStudy, id, validIds),
      },
    ]),
  );
  Object.values(normalized).forEach((book) => {
    book.manualCoStudy.forEach((otherId) => {
      const other = normalized[otherId];
      if (!other) return;
      other.manualCoStudy = validRelationIds(
        [...other.manualCoStudy, book.id],
        other.id,
        validIds,
      );
    });
  });
  return normalized;
}
