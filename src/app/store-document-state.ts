import {
  clearDocumentAcquisitionState,
  documentGreylistHash,
  documentRefGreylistKey,
  documentRefIsTrackedQbittorrentReplacement,
  documentRefShouldBeReplaced,
  mergeDocumentCandidateQueue,
  observeDocumentGreylist,
} from '../core/document-acquisition-state';
import type {
  BookDocumentCandidateOption,
  BookDocumentBlockedCandidateOption,
  BookDocumentSearchAttempt,
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
    documentRefIsTrackedQbittorrentReplacement(document);
  const newKey = documentRefGreylistKey(document);
  const documentsBeforeMerge = replacementStarted
    ? (book.documents ?? []).filter((existing) => {
        const existingKey = documentRefGreylistKey(existing);
        return !(
          existing.provider === 'qbittorrent' &&
          existingKey !== newKey &&
          documentRefShouldBeReplaced(existing, book.documentAcquisition)
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

export function replacedQbittorrentDocuments(
  beforeBook: PlannerProjectV1['library']['books'][string],
  afterBook: PlannerProjectV1['library']['books'][string],
): BookDocumentRef[] {
  const afterReplacement = (afterBook.documents ?? []).some(
    documentRefIsTrackedQbittorrentReplacement,
  );
  if (!afterReplacement) return [];
  const afterKeys = new Set(
    (afterBook.documents ?? [])
      .filter((document) => document.provider === 'qbittorrent')
      .map(documentRefGreylistKey),
  );
  return (beforeBook.documents ?? []).filter(
    (document) =>
      document.provider === 'qbittorrent' &&
      !afterKeys.has(documentRefGreylistKey(document)) &&
      documentRefShouldBeReplaced(document, beforeBook.documentAcquisition),
  );
}

export function staleQbittorrentCandidateHashes(
  afterBook: PlannerProjectV1['library']['books'][string],
): string[] {
  const activeReplacement = (afterBook.documents ?? []).some(
    documentRefIsTrackedQbittorrentReplacement,
  );
  if (!activeReplacement) return [];
  const keptHashes = new Set(
    (afterBook.documents ?? [])
      .map((document) => document.torrentHash?.toLowerCase())
      .filter((hash): hash is string => Boolean(hash)),
  );
  const hashes = new Set<string>();
  for (const candidate of afterBook.documentAcquisition?.candidateQueue ?? []) {
    const key = candidate.greylistKey ?? '';
    const entry = afterBook.documentAcquisition?.greylist[key];
    const hash = documentGreylistHash(candidate);
    if (
      hash &&
      !keptHashes.has(hash) &&
      ((candidate.greylistPenalty ?? 0) > 0 || (entry?.penalty ?? 0) > 0)
    ) {
      hashes.add(hash);
    }
  }
  return [...hashes].sort();
}

export function projectWithCandidateQueue(
  project: PlannerProjectV1,
  bookId: string,
  candidates: BookDocumentCandidateOption[],
  diagnostics: {
    blockedCandidates?: BookDocumentBlockedCandidateOption[];
    searchAttempts?: BookDocumentSearchAttempt[];
  } = {},
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
            diagnostics,
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
    const documentRefsShared = (book.documents ?? []).some((other) => {
      const sameHash = hash && other.torrentHash?.toLowerCase() === hash;
      const samePath = other.storagePath.toLowerCase() === path;
      return sameHash || samePath;
    });
    const candidateRefsShared =
      hash &&
      (book.documentAcquisition?.candidateQueue ?? []).some(
        (candidate) => documentGreylistHash(candidate) === hash,
      );
    return documentRefsShared || candidateRefsShared;
  });
}

function torrentHashSharedOutsideBooks(
  project: PlannerProjectV1,
  affectedBookIds: Set<string>,
  hash: string,
): boolean {
  const normalizedHash = hash.toLowerCase();
  return Object.values(project.library.books).some((book) => {
    if (affectedBookIds.has(book.id)) return false;
    const documentRefsHash = (book.documents ?? []).some(
      (document) => document.torrentHash?.toLowerCase() === normalizedHash,
    );
    const candidateRefsHash = (
      book.documentAcquisition?.candidateQueue ?? []
    ).some((candidate) => documentGreylistHash(candidate) === normalizedHash);
    return documentRefsHash || candidateRefsHash;
  });
}

export async function deleteQbittorrentHashes(
  project: PlannerProjectV1,
  affectedBookIds: Set<string>,
  qbittorrentService: QbittorrentIntegrationService | undefined,
  qbittorrentConnection: Parameters<
    QbittorrentIntegrationService['deleteTorrent']
  >[0],
  hashes: string[],
): Promise<string[]> {
  if (!qbittorrentService) return [];
  const errors: string[] = [];
  for (const hash of [...new Set(hashes.map((item) => item.toLowerCase()))]) {
    if (torrentHashSharedOutsideBooks(project, affectedBookIds, hash)) {
      continue;
    }
    try {
      await qbittorrentService.deleteTorrent(qbittorrentConnection, hash, true);
    } catch (error) {
      errors.push(
        error instanceof Error
          ? error.message
          : `Could not delete torrent ${hash}.`,
      );
    }
  }
  return errors;
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
