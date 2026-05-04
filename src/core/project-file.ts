import {
  DEFAULT_UI_STATE,
  createDefaultConstraints,
} from './defaults';
import {
  normalizeConstraints,
  normalizeUiPreferences,
} from './project-normalize-constraints';
import {
  normalizeBook,
  normalizeCacheEntry,
} from './project-normalize-book';
import {
  normalizeActualOverrides,
  normalizeBookIdMap,
  normalizeManualSchedule,
} from './project-normalize-overrides';
import { normalizeSourceSettings } from './project-normalize-sources';
import type { BookRecord, PlannerProjectV1 } from './types';

export function createEmptyProject(): PlannerProjectV1 {
  return {
    version: 1,
    library: { books: {} },
    manualOverrides: { schedule: {}, deferred: {}, actuals: {} },
    constraints: createDefaultConstraints(),
    sourceSettings: normalizeSourceSettings(undefined),
    enrichmentCache: {},
    uiPreferences: {
      ganttView: DEFAULT_UI_STATE.ganttView,
      ganttZoom: DEFAULT_UI_STATE.ganttZoom,
      planColorMode: DEFAULT_UI_STATE.planColorMode,
    },
  };
}

export function serializeProject(project: PlannerProjectV1): string {
  return JSON.stringify(project, null, 2);
}

function validRelationIds(ids: string[], sourceId: string, validIds: Set<string>): string[] {
  return Array.from(new Set(ids))
    .filter((id) => id !== sourceId && validIds.has(id))
    .sort();
}

function normalizeBookRelations(
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
      other.manualCoStudy = validRelationIds([...other.manualCoStudy, book.id], other.id, validIds);
    });
  });
  return normalized;
}

export function normalizeProject(raw: Record<string, unknown>): PlannerProjectV1 {
  if (raw.version !== 1) {
    throw new Error('Unsupported project file. Expected PlannerProjectV1.');
  }

  const booksInput =
    raw.library && typeof raw.library === 'object'
      ? (((raw.library as Record<string, unknown>).books as Record<string, unknown> | undefined) ?? {})
      : {};
  const rawBooks = Object.fromEntries(
    Object.entries(booksInput).map(([id, book], index) => [id, normalizeBook(id, book, index)]),
  );
  const validIds = new Set(Object.keys(rawBooks));
  const books = normalizeBookRelations(rawBooks, validIds);

  const cacheInput =
    raw.enrichmentCache && typeof raw.enrichmentCache === 'object'
      ? (raw.enrichmentCache as Record<string, unknown>)
      : {};
  const enrichmentCache = Object.fromEntries(
    Object.keys(books).map((bookId) => [bookId, normalizeCacheEntry(bookId, cacheInput[bookId])]),
  );
  const manualOverrides =
    raw.manualOverrides && typeof raw.manualOverrides === 'object'
      ? (raw.manualOverrides as Record<string, unknown>)
      : {};

  return {
    version: 1,
    library: { books },
    manualOverrides: {
      schedule: normalizeManualSchedule(manualOverrides.schedule, validIds),
      deferred: normalizeBookIdMap(manualOverrides.deferred, validIds),
      actuals: normalizeActualOverrides(manualOverrides.actuals, validIds),
    },
    constraints: normalizeConstraints(raw.constraints),
    sourceSettings: normalizeSourceSettings(raw.sourceSettings),
    enrichmentCache,
    uiPreferences: normalizeUiPreferences(raw),
  };
}

export function parseProject(text: string): PlannerProjectV1 {
  const raw = JSON.parse(text) as Record<string, unknown>;
  return normalizeProject(raw);
}
