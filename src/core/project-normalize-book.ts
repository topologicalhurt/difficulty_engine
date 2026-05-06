import { sanitizeChapterTitles } from './chapter-titles';
import { normalizedIsbn } from './isbn';
import { normalizeOpenLibraryKey } from './openlibrary-keys';
import { normalizeBookDocuments } from './project-normalize-documents';
import { normalizeProvenance } from './project-normalize-provenance';
import type {
  BookEnrichment,
  BookRecord,
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

export function normalizeBookEnrichment(input: unknown): BookEnrichment {
  const raw =
    input && typeof input === 'object'
      ? (input as Record<string, unknown>)
      : {};
  return {
    chapters: sanitizeChapterTitles(normalizeStringArray(raw.chapters), {
      source: 'imported',
    }),
    description: normalizeString(raw.description),
    olSubjects: normalizeStringArray(raw.olSubjects),
    tocSource: normalizeTocSource(raw.tocSource),
    provenance:
      raw.provenance && typeof raw.provenance === 'object'
        ? {
            chapters: normalizeProvenance(
              (raw.provenance as Record<string, unknown>).chapters,
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
    manualSeedDifficulty: safeNumber(raw.manualSeedDifficulty, 5),
    pages: Math.max(1, Math.round(safeNumber(raw.pages, 200))),
    subjects: normalizeStringArray(raw.subjects),
    publisher: normalizeString(raw.publisher),
    isbn: normalizedIsbn(normalizeString(raw.isbn)) || null,
    year:
      raw.year == null || raw.year === ''
        ? null
        : Math.max(0, Math.round(safeNumber(raw.year, 0))),
    sourcePath: normalizeString(raw.sourcePath) || null,
    documents,
    selectedDocumentId: documents.some((doc) => doc.id === selectedDocumentId)
      ? selectedDocumentId
      : null,
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
