import {
  DEFAULT_UI_STATE,
  createDefaultAiRecommendationSettings,
  createDefaultConstraints,
} from './defaults';
import { normalizeAiRecommendationSettings } from './project-normalize-ai';
import {
  normalizeConstraints,
  normalizeUiPreferences,
} from './project-normalize-constraints';
import { normalizeBook, normalizeCacheEntry } from './project-normalize-book';
import {
  normalizeActualOverrides,
  normalizeBookIdMap,
  normalizeManualSchedule,
} from './project-normalize-overrides';
import { normalizeBookRelations } from './project-normalize-relations';
import { normalizeSourceSettings } from './project-normalize-sources';
import type { PlannerProjectV1 } from './types';

export function createEmptyProject(): PlannerProjectV1 {
  return {
    version: 1,
    library: { books: {} },
    manualOverrides: { schedule: {}, deferred: {}, actuals: {} },
    constraints: createDefaultConstraints(),
    aiRecommendationSettings: createDefaultAiRecommendationSettings(),
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

export function normalizeProject(
  raw: Record<string, unknown>,
): PlannerProjectV1 {
  if (raw.version !== 1) {
    throw new Error('Unsupported project file. Expected PlannerProjectV1.');
  }

  const booksInput =
    raw.library && typeof raw.library === 'object'
      ? (((raw.library as Record<string, unknown>).books as
          | Record<string, unknown>
          | undefined) ?? {})
      : {};
  const rawBooks = Object.fromEntries(
    Object.entries(booksInput).map(([id, book], index) => [
      id,
      normalizeBook(id, book, index),
    ]),
  );
  const validIds = new Set(Object.keys(rawBooks));
  const books = normalizeBookRelations(rawBooks, validIds);

  const cacheInput =
    raw.enrichmentCache && typeof raw.enrichmentCache === 'object'
      ? (raw.enrichmentCache as Record<string, unknown>)
      : {};
  const enrichmentCache = Object.fromEntries(
    Object.keys(books).map((bookId) => [
      bookId,
      normalizeCacheEntry(bookId, cacheInput[bookId]),
    ]),
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
    aiRecommendationSettings: normalizeAiRecommendationSettings(
      raw.aiRecommendationSettings,
    ),
    sourceSettings: normalizeSourceSettings(raw.sourceSettings),
    enrichmentCache,
    uiPreferences: normalizeUiPreferences(raw),
  };
}

export function parseProject(text: string): PlannerProjectV1 {
  const raw = JSON.parse(text) as Record<string, unknown>;
  return normalizeProject(raw);
}
