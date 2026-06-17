import { sanitizeChapterEntries } from './chapter-titles';
import type { ChapterTitleEntry } from './chapter-titles';
import { persistedIsbn } from './isbn';
import { normalizeOpenLibraryKey } from './openlibrary-keys';
import {
  normalizeBookDocumentAcquisition,
  normalizeBookDocuments,
} from './project-normalize-documents';
import { normalizeProvenance } from './project-normalize-provenance';
import { normalizeBookReadingScope } from './project-normalize-reading-scope';
import type {
  BookEnrichment,
  BookRecord,
  ChapterPageRange,
  EnrichmentCacheEntry,
  EnrichmentFieldProvenance,
} from './types';
import { compactItems, safeNumber } from './utils';
import {
  normalizeBoolean,
  normalizeNumber,
  normalizeString,
  normalizeStringArray,
} from './project-normalize-primitives';

function normalizeTocSource(value: unknown): BookEnrichment['tocSource'] {
  const normalized = normalizeString(value).toLowerCase();
  if (
    normalized === 'manual' ||
    normalized === 'search' ||
    normalized === 'openlibrary' ||
    normalized === 'google_books' ||
    normalized === 'internet_archive' ||
    normalized === 'pdf'
  ) {
    return normalized;
  }
  if (
    normalized === 'imported' ||
    normalized === 'edition' ||
    normalized === 'work'
  ) {
    return 'openlibrary';
  }
  return 'none';
}

function normalizeChapterPageRange(value: unknown): ChapterPageRange | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const start = normalizeNumber(raw.start, Number.NaN, 1, undefined, true);
  if (!Number.isFinite(start)) return null;
  const end =
    raw.end == null || raw.end === ''
      ? null
      : normalizeNumber(raw.end, Number.NaN, start, undefined, true);
  return {
    start,
    end: end != null && Number.isFinite(end) ? end : null,
  };
}

// Page ranges are positionally keyed to the *original* chapter array, but
// sanitizeChapterEntries filters/dedups entries and re-indexes them. Realign
// each surviving entry's range by its sourceIndex so removing a middle chapter
// does not shift every later range onto the wrong chapter (which corrupts
// effectiveReadingPages — planner truth).
function alignedPageRanges(
  value: unknown,
  entries: ChapterTitleEntry[],
): BookEnrichment['chapterPageRanges'] {
  if (!Array.isArray(value)) return undefined;
  return entries.map((entry) =>
    normalizeChapterPageRange(
      entry.sourceIndex != null ? value[entry.sourceIndex] : undefined,
    ),
  );
}

export function normalizeBookEnrichment(input: unknown): BookEnrichment {
  const raw =
    input && typeof input === 'object'
      ? (input as Record<string, unknown>)
      : {};
  const chapterEntries = sanitizeChapterEntries(
    normalizeStringArray(raw.chapters),
    { source: 'imported' },
  );
  const topicEntries = sanitizeChapterEntries(
    normalizeStringArray(raw.topics),
    { source: 'imported' },
  );
  const chapters = chapterEntries.map((entry) => entry.title);
  const topics = topicEntries.map((entry) => entry.title);
  return {
    chapters,
    chapterPageRanges: alignedPageRanges(raw.chapterPageRanges, chapterEntries),
    topics,
    topicPageRanges: alignedPageRanges(raw.topicPageRanges, topicEntries),
    description: normalizeString(raw.description),
    olSubjects: normalizeStringArray(raw.olSubjects),
    tocSource: normalizeTocSource(raw.tocSource),
    provenance:
      raw.provenance && typeof raw.provenance === 'object'
        ? {
            chapters: normalizeProvenance(
              (raw.provenance as Record<string, unknown>).chapters,
            ),
            topics: normalizeProvenance(
              (raw.provenance as Record<string, unknown>).topics,
            ),
            description: normalizeProvenance(
              (raw.provenance as Record<string, unknown>).description,
            ),
            subjects: normalizeProvenance(
              (raw.provenance as Record<string, unknown>).subjects,
            ),
          }
        : undefined,
  };
}

export function normalizeBook(
  id: string,
  input: unknown,
  index: number,
): BookRecord {
  const raw =
    input && typeof input === 'object'
      ? (input as Record<string, unknown>)
      : {};
  const documents = normalizeBookDocuments(raw.documents);
  const selectedDocumentId = normalizeString(raw.selectedDocumentId);
  return {
    id,
    title: normalizeString(raw.title, id),
    short: normalizeString(raw.short, normalizeString(raw.title, id)) || id,
    authors: normalizeStringArray(raw.authors),
    displayGroup: normalizeString(raw.displayGroup, 'Core') || 'Core',
    manualSeedDifficulty: normalizeNumber(raw.manualSeedDifficulty, 5, 1, 10),
    pages: normalizeNumber(raw.pages, 200, 1, 100000, true),
    subjects: normalizeStringArray(raw.subjects),
    publisher: normalizeString(raw.publisher),
    isbn: persistedIsbn(normalizeString(raw.isbn)),
    year:
      raw.year == null || raw.year === ''
        ? null
        : Math.max(0, Math.round(safeNumber(raw.year, 0))),
    sourcePath: normalizeString(raw.sourcePath) || null,
    documents,
    selectedDocumentId: documents.some((doc) => doc.id === selectedDocumentId)
      ? selectedDocumentId
      : null,
    documentAcquisition: normalizeBookDocumentAcquisition(
      raw.documentAcquisition,
    ),
    openLibraryKey: normalizeOpenLibraryKey(
      normalizeString(raw.openLibraryKey),
      'any',
    ),
    openLibraryEditionKey: normalizeOpenLibraryKey(
      normalizeString(raw.openLibraryEditionKey),
      'edition',
    ),
    openLibraryWorkKey: normalizeOpenLibraryKey(
      normalizeString(raw.openLibraryWorkKey),
      'work',
    ),
    googleBooksId: normalizeString(raw.googleBooksId) || null,
    manualPrereqs: normalizeStringArray(raw.manualPrereqs),
    manualCoStudy: normalizeStringArray(raw.manualCoStudy),
    owned: raw.owned == null ? true : normalizeBoolean(raw.owned),
    planOrder: normalizeNumber(raw.planOrder, index, 0, 100000, true),
    allowPrereqOverlap: normalizeBoolean(raw.allowPrereqOverlap),
    lockDiff: normalizeBoolean(raw.lockDiff),
    noPropOut: normalizeBoolean(raw.noPropOut),
    ignored: normalizeBoolean(raw.ignored),
    constantRD: normalizeBoolean(raw.constantRD),
    completed: normalizeBoolean(raw.completed),
    enrichment: normalizeBookEnrichment(raw.enrichment),
    readingScope: normalizeBookReadingScope(raw.readingScope),
  };
}

export function normalizeCacheEntry(
  bookId: string,
  input: unknown,
): EnrichmentCacheEntry {
  const raw =
    input && typeof input === 'object'
      ? (input as Record<string, unknown>)
      : {};
  const hasData = Boolean(raw.data);
  const rawStatus =
    raw.status === 'loading' ||
    raw.status === 'success' ||
    raw.status === 'stale' ||
    raw.status === 'failed'
      ? raw.status
      : 'idle';
  const status = rawStatus === 'failed' && hasData ? 'stale' : rawStatus;
  return {
    status,
    bookId,
    cacheKey: normalizeString(raw.cacheKey, bookId),
    fetchedAt: normalizeString(raw.fetchedAt) || undefined,
    staleAt: normalizeString(raw.staleAt) || undefined,
    error: normalizeString(raw.error) || undefined,
    data: raw.data ? normalizeBookEnrichment(raw.data) : undefined,
    provenance: Array.isArray(raw.provenance)
      ? compactItems(
          raw.provenance.map(
            (entry): EnrichmentFieldProvenance | null =>
              normalizeProvenance(entry) ?? null,
          ),
        )
      : undefined,
  };
}
