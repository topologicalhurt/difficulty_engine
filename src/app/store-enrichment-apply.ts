import type {
  BookRecord,
  EnrichmentResponse,
  PlannerProjectV1,
} from '../core/types';
import { mergeEnrichmentIntoBook } from './store-book-metadata';
import { updateEnrichmentCache } from './store-helpers';
import {
  replacedQbittorrentDocuments,
  staleQbittorrentCandidateHashes,
} from './store-document-state';
import { cacheExpiresAt, isoTimestamp } from '../infra/cache-time';

export interface AppliedRefreshResult {
  project: PlannerProjectV1;
  replacedDocuments: NonNullable<BookRecord['documents']>;
  replacedHashes: string[];
}

function mergeResponseIntoBook(
  currentBook: BookRecord,
  response: EnrichmentResponse,
): BookRecord {
  return mergeEnrichmentIntoBook(currentBook, {
    ...response.bookPatch,
    enrichment: {
      ...response.enrichment,
      provenance: {
        ...currentBook.enrichment.provenance,
        chapters: response.enrichment.chapters.length
          ? (response.enrichment.provenance?.chapters ?? response.provenance[0])
          : currentBook.enrichment.provenance?.chapters,
        description: response.enrichment.description
          ? (response.enrichment.provenance?.description ??
            response.provenance[0])
          : currentBook.enrichment.provenance?.description,
        subjects: response.enrichment.olSubjects.length
          ? (response.enrichment.provenance?.subjects ?? response.provenance[0])
          : currentBook.enrichment.provenance?.subjects,
      },
    },
  });
}

export function applySuccessfulEnrichmentRefresh({
  project,
  bookId,
  response,
  fetchedAt,
  staleWindowMs,
  nowMs,
}: {
  project: PlannerProjectV1;
  bookId: string;
  response: EnrichmentResponse;
  fetchedAt: string;
  staleWindowMs: number;
  nowMs: () => number;
}): AppliedRefreshResult {
  const currentBook = project.library.books[bookId];
  if (!currentBook) {
    return { project, replacedDocuments: [], replacedHashes: [] };
  }
  const mergedBook = mergeResponseIntoBook(currentBook, response);
  const replacedDocuments = replacedQbittorrentDocuments(
    currentBook,
    mergedBook,
  );
  const replacedDocumentHashes = new Set(
    replacedDocuments
      .map((document) => document.torrentHash?.toLowerCase())
      .filter((hash): hash is string => Boolean(hash)),
  );
  const replacedHashes = staleQbittorrentCandidateHashes(mergedBook).filter(
    (hash) => !replacedDocumentHashes.has(hash),
  );
  let nextProject: PlannerProjectV1 = {
    ...project,
    library: {
      books: {
        ...project.library.books,
        [bookId]: mergedBook,
      },
    },
  };
  nextProject = updateEnrichmentCache(nextProject, bookId, {
    status: 'success',
    cacheKey: response.cacheKey,
    fetchedAt,
    staleAt: isoTimestamp(() => cacheExpiresAt(staleWindowMs, nowMs)),
    error: undefined,
    data: response.enrichment,
    provenance: response.provenance,
  });
  return { project: nextProject, replacedDocuments, replacedHashes };
}
