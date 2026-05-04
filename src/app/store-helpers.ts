import { DEFAULT_UI_STATE, EXAMPLE_BOOK } from '../core/defaults';
import { serializeProject } from '../core/project-file';
import { normalizedIsbn } from '../core/book-identity';
import { normalizeOpenLibraryKey } from '../core/openlibrary-keys';
import type {
  AppState,
  BookSearchSuggestion,
  BookRecord,
  CreatePlannerStoreOptions,
  EnrichmentCacheEntry,
  PlannerProjectV1,
  UiState,
} from '../core/types';

export function withSnapshot(
  project: PlannerProjectV1,
  ui: UiState,
  engine: CreatePlannerStoreOptions['engine'],
): AppState {
  return {
    project,
    ui,
    snapshot: engine.computeSnapshot(project),
    enrichment: {
      byBookId: project.enrichmentCache,
    },
  };
}

export function nextBookId(project: PlannerProjectV1): string {
  const existing = new Set(Object.keys(project.library.books));
  let index = Object.keys(project.library.books).length + 1;
  while (existing.has(`book-${index}`)) {
    index += 1;
  }
  return `book-${index}`;
}

function ensureSelectedBook(project: PlannerProjectV1, selectedBookId: string | null): string | null {
  if (selectedBookId && project.library.books[selectedBookId]) {
    return selectedBookId;
  }
  return null;
}

function shortLabelFromTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length <= 22) {
    return trimmed;
  }
  return `${trimmed.slice(0, 19).trimEnd()}...`;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function bookFromSuggestion(id: string, suggestion: BookSearchSuggestion): BookRecord {
  return {
    ...EXAMPLE_BOOK,
    id,
    title: suggestion.title,
    short: shortLabelFromTitle(suggestion.title),
    authors: suggestion.authors.length ? suggestion.authors : EXAMPLE_BOOK.authors,
    pages: suggestion.pages ?? 250,
    subjects: suggestion.subjects.slice(0, 12),
    publisher: suggestion.publisher,
    isbn: normalizedIsbn(suggestion.isbn) || null,
    year: suggestion.year,
    openLibraryKey: normalizeOpenLibraryKey(suggestion.openLibraryKey, 'any'),
    openLibraryEditionKey: normalizeOpenLibraryKey(suggestion.openLibraryEditionKey, 'edition'),
    openLibraryWorkKey: normalizeOpenLibraryKey(suggestion.openLibraryWorkKey, 'work'),
    googleBooksId: suggestion.googleBooksId ?? null,
    enrichment: {
      chapters: [],
      description: suggestion.description,
      olSubjects: suggestion.subjects.slice(0, 20),
      tocSource: 'search',
    },
  };
}

export function mergeSuggestionIntoBook(
  book: BookRecord,
  suggestion: BookSearchSuggestion,
): BookRecord {
  const mergedSubjects = uniqueStrings([...book.subjects, ...suggestion.subjects]).slice(0, 20);
  const mergedOlSubjects = uniqueStrings([
    ...book.enrichment.olSubjects,
    ...suggestion.subjects,
  ]).slice(0, 30);
  const nextIsbn = normalizedIsbn(book.isbn) || normalizedIsbn(suggestion.isbn) || null;
  return {
    ...book,
    authors: book.authors.length ? book.authors : suggestion.authors,
    pages:
      suggestion.pages && (book.pages <= 1 || book.pages === 250)
        ? suggestion.pages
        : book.pages,
    subjects: mergedSubjects,
    publisher: book.publisher || suggestion.publisher,
    isbn: nextIsbn,
    year: book.year ?? suggestion.year,
    openLibraryKey: normalizeOpenLibraryKey(book.openLibraryKey ?? suggestion.openLibraryKey, 'any'),
    openLibraryEditionKey:
      normalizeOpenLibraryKey(book.openLibraryEditionKey ?? suggestion.openLibraryEditionKey, 'edition'),
    openLibraryWorkKey: normalizeOpenLibraryKey(book.openLibraryWorkKey ?? suggestion.openLibraryWorkKey, 'work'),
    googleBooksId: book.googleBooksId ?? suggestion.googleBooksId ?? null,
    enrichment: {
      ...book.enrichment,
      description: book.enrichment.description || suggestion.description,
      olSubjects: mergedOlSubjects,
      tocSource:
        book.enrichment.tocSource === 'none' && suggestion.description
          ? 'search'
          : book.enrichment.tocSource,
    },
  };
}

export function mergeEnrichmentIntoBook(
  book: BookRecord,
  patch: Partial<BookRecord>,
): BookRecord {
  const mergedSubjects = uniqueStrings([...book.subjects, ...(patch.subjects ?? [])]).slice(0, 30);
  const nextPages =
    patch.pages && (book.pages <= 1 || book.pages === 250) ? patch.pages : book.pages;
  return {
    ...book,
    title: patch.title ?? book.title,
    short: patch.short ?? book.short,
    authors: patch.authors?.length ? patch.authors : book.authors,
    pages: nextPages,
    subjects: mergedSubjects,
    publisher: book.publisher || patch.publisher || '',
    isbn: normalizedIsbn(book.isbn) || normalizedIsbn(patch.isbn) || null,
    year: book.year ?? patch.year ?? null,
    sourcePath: patch.sourcePath ?? book.sourcePath ?? null,
    documents: patch.documents ?? book.documents ?? [],
    selectedDocumentId: patch.selectedDocumentId ?? book.selectedDocumentId ?? null,
    openLibraryKey: normalizeOpenLibraryKey(patch.openLibraryKey ?? book.openLibraryKey, 'any'),
    openLibraryEditionKey:
      normalizeOpenLibraryKey(patch.openLibraryEditionKey ?? book.openLibraryEditionKey, 'edition'),
    openLibraryWorkKey: normalizeOpenLibraryKey(patch.openLibraryWorkKey ?? book.openLibraryWorkKey, 'work'),
    googleBooksId: patch.googleBooksId ?? book.googleBooksId ?? null,
    enrichment: {
      ...book.enrichment,
      ...(patch.enrichment ?? {}),
      olSubjects: uniqueStrings([
        ...book.enrichment.olSubjects,
        ...(patch.enrichment?.olSubjects ?? []),
      ]).slice(0, 40),
      chapters: (patch.enrichment?.chapters?.length
        ? patch.enrichment.chapters
        : book.enrichment.chapters),
      description: patch.enrichment?.description || book.enrichment.description,
      tocSource: patch.enrichment?.tocSource ?? book.enrichment.tocSource,
      provenance: {
        ...book.enrichment.provenance,
        ...(patch.enrichment?.provenance ?? {}),
      },
    },
  };
}

export function buildUi(project: PlannerProjectV1, ui: Partial<UiState> = {}): UiState {
  const selectedCalendarEntry =
    ui.selectedCalendarEntry && project.library.books[ui.selectedCalendarEntry.bookId]
      ? ui.selectedCalendarEntry
      : null;
  return {
    ...DEFAULT_UI_STATE,
    ...ui,
    selectedBookId: ensureSelectedBook(project, ui.selectedBookId ?? DEFAULT_UI_STATE.selectedBookId),
    selectedCalendarEntry,
    ganttView: ui.ganttView ?? project.uiPreferences.ganttView,
    ganttZoom: ui.ganttZoom ?? project.uiPreferences.ganttZoom,
    planColorMode: ui.planColorMode ?? project.uiPreferences.planColorMode,
    openConstraintGroups: ui.openConstraintGroups ?? DEFAULT_UI_STATE.openConstraintGroups,
    selectedConstraintKey: ui.selectedConstraintKey ?? DEFAULT_UI_STATE.selectedConstraintKey,
    bookSearchQuery: ui.bookSearchQuery ?? DEFAULT_UI_STATE.bookSearchQuery,
    bookSearchStatus: ui.bookSearchStatus ?? DEFAULT_UI_STATE.bookSearchStatus,
    bookSearchResults: ui.bookSearchResults ?? DEFAULT_UI_STATE.bookSearchResults,
    bookSearchHasMore: ui.bookSearchHasMore ?? DEFAULT_UI_STATE.bookSearchHasMore,
    bookSearchOffset: ui.bookSearchOffset ?? DEFAULT_UI_STATE.bookSearchOffset,
    bookSearchError: ui.bookSearchError ?? DEFAULT_UI_STATE.bookSearchError,
    importExportText: ui.importExportText ?? serializeProject(project),
    importExportDirty: ui.importExportDirty ?? DEFAULT_UI_STATE.importExportDirty,
    qbittorrentConnection: ui.qbittorrentConnection ?? DEFAULT_UI_STATE.qbittorrentConnection,
    qbittorrentStatus: ui.qbittorrentStatus ?? DEFAULT_UI_STATE.qbittorrentStatus,
    documentReader: ui.documentReader ?? DEFAULT_UI_STATE.documentReader,
  };
}

export function updateEnrichmentCache(
  projectToUpdate: PlannerProjectV1,
  bookId: string,
  patch: Partial<EnrichmentCacheEntry>,
): PlannerProjectV1 {
  return {
    ...projectToUpdate,
    enrichmentCache: {
      ...projectToUpdate.enrichmentCache,
      [bookId]: {
        ...(projectToUpdate.enrichmentCache[bookId] ?? {
          status: 'idle',
          bookId,
          cacheKey: bookId,
        }),
        ...patch,
      },
    },
  };
}
