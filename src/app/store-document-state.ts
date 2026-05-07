import {
  clearDocumentAcquisitionState,
  documentRefGreylistKey,
  documentRefIsGreylistable,
  mergeDocumentCandidateQueue,
  observeDocumentGreylist,
} from '../core/document-acquisition-state';
import type {
  BookDocumentCandidateOption,
  BookDocumentRef,
  PlannerProjectV1,
  QbittorrentIntegrationService,
} from '../core/types';
import {
  chooseSelectedDocumentId,
  mergeDocumentRefs,
} from '../infra/document-acquisition';
import { bridgeEndpoint } from '../infra/document-bridge-url';

export function projectWithDocumentRemoved(
  project: PlannerProjectV1,
  bookId: string,
  documentId: string,
): PlannerProjectV1 {
  const book = project.library.books[bookId];
  if (!book) return project;
  const documents = (book.documents ?? []).filter(
    (document) => document.id !== documentId,
  );
  return {
    ...project,
    library: {
      books: {
        ...project.library.books,
        [bookId]: {
          ...book,
          documents,
          selectedDocumentId:
            book.selectedDocumentId === documentId
              ? chooseSelectedDocumentId(
                  documents,
                  null,
                  project.sourceSettings.contentPreference,
                )
              : book.selectedDocumentId,
        },
      },
    },
  };
}

export function projectWithDocumentAdded(
  project: PlannerProjectV1,
  bookId: string,
  document: BookDocumentRef,
): PlannerProjectV1 {
  const book = project.library.books[bookId];
  if (!book) return project;
  const replacementStarted =
    document.provider === 'qbittorrent' &&
    document.status !== 'failed' &&
    document.status !== 'stalled';
  const newKey = documentRefGreylistKey(document);
  const documentsBeforeMerge = replacementStarted
    ? (book.documents ?? []).filter((existing) => {
        const existingKey = documentRefGreylistKey(existing);
        return !(
          existing.provider === 'qbittorrent' &&
          existingKey !== newKey &&
          (documentRefIsGreylistable(existing) ||
            book.documentAcquisition?.greylist[existingKey])
        );
      })
    : (book.documents ?? []);
  const documents = mergeDocumentRefs(documentsBeforeMerge, [document]);
  const documentAcquisition = observeDocumentGreylist(
    book.documentAcquisition,
    documents,
  );
  return {
    ...project,
    library: {
      books: {
        ...project.library.books,
        [bookId]: {
          ...book,
          documents,
          selectedDocumentId: chooseSelectedDocumentId(
            documents,
            book.selectedDocumentId,
            project.sourceSettings.contentPreference,
          ),
          documentAcquisition,
        },
      },
    },
  };
}

export function projectWithCandidateQueue(
  project: PlannerProjectV1,
  bookId: string,
  candidates: BookDocumentCandidateOption[],
): PlannerProjectV1 {
  const book = project.library.books[bookId];
  if (!book) return project;
  const observedState = observeDocumentGreylist(
    book.documentAcquisition,
    book.documents ?? [],
  );
  return {
    ...project,
    library: {
      books: {
        ...project.library.books,
        [bookId]: {
          ...book,
          documentAcquisition: mergeDocumentCandidateQueue(
            observedState,
            candidates,
          ),
        },
      },
    },
  };
}

export function bookCandidateContextKey(
  book: PlannerProjectV1['library']['books'][string],
): string {
  return JSON.stringify({
    title: book.title,
    authors: book.authors,
    isbn: book.isbn,
    sourcePath: book.sourcePath,
  });
}

export async function postDocumentAction(
  baseUrl: string,
  endpoint: string,
  storagePath: string,
): Promise<void> {
  const response = await fetch(bridgeEndpoint(baseUrl, endpoint), {
    method: 'POST',
    body: JSON.stringify({ path: storagePath }),
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) throw new Error(await response.text());
}

function documentSharedOutsideBooks(
  project: PlannerProjectV1,
  affectedBookIds: Set<string>,
  document: BookDocumentRef,
): boolean {
  const hash = document.torrentHash?.toLowerCase();
  const path = document.storagePath.toLowerCase();
  return Object.values(project.library.books).some((book) => {
    if (affectedBookIds.has(book.id)) return false;
    return (book.documents ?? []).some((other) => {
      const sameHash = hash && other.torrentHash?.toLowerCase() === hash;
      const samePath = other.storagePath.toLowerCase() === path;
      return sameHash || samePath;
    });
  });
}

export async function deleteDocumentContent(
  project: PlannerProjectV1,
  affectedBookIds: Set<string>,
  connectionBaseUrl: string,
  qbittorrentService: QbittorrentIntegrationService | undefined,
  qbittorrentConnection: Parameters<
    QbittorrentIntegrationService['deleteTorrent']
  >[0],
  documents: BookDocumentRef[],
): Promise<string[]> {
  const errors: string[] = [];
  const deletedHashes = new Set<string>();
  const deletedPaths = new Set<string>();
  for (const document of documents) {
    if (documentSharedOutsideBooks(project, affectedBookIds, document)) {
      continue;
    }
    const hash = document.torrentHash?.toLowerCase();
    if (hash && !deletedHashes.has(hash) && qbittorrentService) {
      deletedHashes.add(hash);
      try {
        await qbittorrentService.deleteTorrent(
          qbittorrentConnection,
          hash,
          true,
        );
      } catch (error) {
        errors.push(
          error instanceof Error
            ? error.message
            : `Could not delete torrent ${hash}.`,
        );
      }
    }
    const path = document.storagePath;
    if (path && !deletedPaths.has(path)) {
      deletedPaths.add(path);
      try {
        await postDocumentAction(connectionBaseUrl, '/documents/delete', path);
      } catch (error) {
        errors.push(
          error instanceof Error
            ? error.message
            : `Could not delete ${document.fileName}.`,
        );
      }
    }
  }
  return errors;
}

export function metadataClearedBook(
  book: PlannerProjectV1['library']['books'][string],
): PlannerProjectV1['library']['books'][string] {
  return {
    ...book,
    sourcePath: null,
    documents: [],
    selectedDocumentId: null,
    documentAcquisition: clearDocumentAcquisitionState(),
    openLibraryKey: null,
    openLibraryEditionKey: null,
    openLibraryWorkKey: null,
    googleBooksId: null,
    enrichment: {
      chapters: [],
      description: '',
      olSubjects: [],
      tocSource: 'none',
    },
  };
}

export function idleCacheEntry(
  bookId: string,
): PlannerProjectV1['enrichmentCache'][string] {
  return { status: 'idle', bookId, cacheKey: bookId };
}
