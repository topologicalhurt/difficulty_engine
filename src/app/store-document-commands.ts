import type {
  BookDocumentCandidateOption,
  BookDocumentRef,
  CreatePlannerStoreOptions,
  PlannerProjectV1,
  PlannerStoreCommands,
} from '../core/types';
import {
  chooseSelectedDocumentId,
  mergeDocumentRefs,
} from '../infra/document-acquisition';
import { bridgeEndpoint } from '../infra/document-bridge-url';
import type { StoreCommandContext } from './store-command-context';

function isSafeTorrentSource(value: string): boolean {
  if (/^magnet:/i.test(value)) return true;
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === 'https:' && /\.torrent(?:$|\?)/i.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

function bookDocument(
  project: PlannerProjectV1,
  bookId: string,
  documentId: string,
): { book: PlannerProjectV1['library']['books'][string]; document: BookDocumentRef } | null {
  const book = project.library.books[bookId];
  const document = book?.documents?.find((item) => item.id === documentId);
  return book && document ? { book, document } : null;
}

function projectWithDocumentRemoved(
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

function projectWithDocumentAdded(
  project: PlannerProjectV1,
  bookId: string,
  document: BookDocumentRef,
): PlannerProjectV1 {
  const book = project.library.books[bookId];
  if (!book) return project;
  const documents = mergeDocumentRefs(book.documents ?? [], [document]);
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
        },
      },
    },
  };
}

async function postDocumentAction(
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

export function createDocumentCommands(
  context: StoreCommandContext,
  services: CreatePlannerStoreOptions,
): Pick<
  PlannerStoreCommands,
  | 'openBookDocument'
  | 'revealBookDocument'
  | 'removeBookDocument'
  | 'refreshBookDocumentCandidates'
  | 'selectBookDocumentCandidate'
  | 'setBookDocumentManualSource'
  | 'addBookTorrentSource'
  | 'readBookDocument'
  | 'closeBookDocumentReader'
> {
  let documentReadSequence = 0;
  let candidateRequestSequence = 0;

  async function openOrRevealBookDocument(
    bookId: string,
    documentId: string,
    endpoint: '/documents/open' | '/documents/reveal',
  ): Promise<void> {
    const state = context.getState();
    const resolved = bookDocument(state.project, bookId, documentId);
    if (!resolved) return;
    const verb = endpoint === '/documents/reveal' ? 'Revealed' : 'Opened';
    const contractId =
      endpoint === '/documents/reveal' ? 'ui.documentReveal' : 'ui.documentOpen';
    try {
      await postDocumentAction(
        state.ui.qbittorrentConnection.baseUrl,
        endpoint,
        resolved.document.storagePath,
      );
      context.commitUi(contractId, {
        banner: {
          tone: 'success',
          message: `${verb} ${resolved.document.fileName}.`,
        },
      });
    } catch (error) {
      context.commitUi(contractId, {
        banner: {
          tone: 'error',
          message:
            error instanceof Error
              ? error.message
              : `Could not ${verb.toLowerCase()} ${resolved.document.fileName}.`,
        },
      });
    }
  }

  async function acquireCandidate(
    bookId: string,
    candidateId: string,
    candidates: BookDocumentCandidateOption[],
  ): Promise<void> {
    const state = context.getState();
    const book = state.project.library.books[bookId];
    if (!book || !services.qbittorrentService) return;
    const document = await services.qbittorrentService.acquireDocumentCandidate(
      state.ui.qbittorrentConnection,
      {
        book,
        sourceSettings: state.project.sourceSettings,
        qbittorrentConnection: state.ui.qbittorrentConnection,
      },
      candidateId,
      candidates,
    );
    if (!document) {
      throw new Error('No trusted file was selected from this candidate.');
    }
    context.commitProject(
      'document.selectCandidate',
      projectWithDocumentAdded(context.getState().project, bookId, document),
      {
        documentCandidates: {
          ...context.getState().ui.documentCandidates,
          bookId,
          status: 'ready',
          error: null,
        },
        banner: {
          tone: 'success',
          message: `Started ${document.fileName}.`,
        },
      },
    );
  }

  return {
    openBookDocument(bookId, documentId): Promise<void> {
      return openOrRevealBookDocument(bookId, documentId, '/documents/open');
    },
    revealBookDocument(bookId, documentId): Promise<void> {
      return openOrRevealBookDocument(bookId, documentId, '/documents/reveal');
    },
    async removeBookDocument(
      bookId,
      documentId,
      options = {},
    ): Promise<void> {
      const state = context.getState();
      const resolved = bookDocument(state.project, bookId, documentId);
      if (!resolved) return;
      const { document } = resolved;
      context.commitProject(
        'document.remove',
        projectWithDocumentRemoved(state.project, bookId, documentId),
        {
          banner: {
            tone: 'success',
            message: `Removed ${document.fileName} from this book.`,
          },
        },
      );
      if (!options.deleteContent) return;
      try {
        if (document.torrentHash && services.qbittorrentService) {
          await services.qbittorrentService.deleteTorrent(
            state.ui.qbittorrentConnection,
            document.torrentHash,
            true,
          );
        }
        await postDocumentAction(
          state.ui.qbittorrentConnection.baseUrl,
          '/documents/delete',
          document.storagePath,
        );
      } catch (error) {
        context.commitUi('document.remove', {
          banner: {
            tone: 'warn',
            message:
              error instanceof Error
                ? `Removed the reference, but content deletion failed: ${error.message}`
                : 'Removed the reference, but content deletion failed.',
          },
        });
      }
    },
    async refreshBookDocumentCandidates(bookId): Promise<void> {
      const state = context.getState();
      const book = state.project.library.books[bookId];
      if (!book) return;
      const sequence = (candidateRequestSequence += 1);
      context.commitUi('document.candidates', {
        documentCandidates: {
          bookId,
          status: 'loading',
          candidates: [],
          error: null,
          manualSource: state.ui.documentCandidates.manualSource,
        },
      });
      try {
        if (!services.qbittorrentService) {
          throw new Error('qBittorrent integration is not available.');
        }
        const candidates =
          await services.qbittorrentService.findDocumentCandidates(
            state.ui.qbittorrentConnection,
            {
              book,
              sourceSettings: state.project.sourceSettings,
              qbittorrentConnection: state.ui.qbittorrentConnection,
            },
          );
        if (sequence !== candidateRequestSequence) return;
        context.commitUi('document.candidates', {
          documentCandidates: {
            bookId,
            status: 'ready',
            candidates,
            error: null,
            manualSource: context.getState().ui.documentCandidates.manualSource,
          },
        });
      } catch (error) {
        if (sequence !== candidateRequestSequence) return;
        context.commitUi('document.candidates', {
          documentCandidates: {
            bookId,
            status: 'failed',
            candidates: [],
            error:
              error instanceof Error
                ? error.message
                : 'Could not load qBittorrent candidates.',
            manualSource: context.getState().ui.documentCandidates.manualSource,
          },
        });
      }
    },
    async selectBookDocumentCandidate(bookId, candidateId): Promise<void> {
      const state = context.getState();
      const candidates =
        state.ui.documentCandidates.bookId === bookId
          ? state.ui.documentCandidates.candidates
          : [];
      try {
        context.commitUi('document.candidates', {
          documentCandidates: {
            ...state.ui.documentCandidates,
            bookId,
            status: 'acquiring',
            error: null,
          },
        });
        await acquireCandidate(bookId, candidateId, candidates);
      } catch (error) {
        context.commitUi('document.candidates', {
          documentCandidates: {
            ...context.getState().ui.documentCandidates,
            bookId,
            status: 'failed',
            error:
              error instanceof Error
                ? error.message
                : 'Could not acquire this qBittorrent result.',
          },
        });
      }
    },
    setBookDocumentManualSource(source): void {
      context.commitUi('document.manualSource', {
        documentCandidates: {
          ...context.getState().ui.documentCandidates,
          manualSource: source,
        },
      });
    },
    async addBookTorrentSource(bookId, sourceUrl): Promise<void> {
      const source = sourceUrl.trim();
      if (!isSafeTorrentSource(source)) {
        context.commitUi('document.manualSource', {
          banner: {
            tone: 'error',
            message: 'Use a magnet link or HTTPS .torrent URL.',
          },
        });
        return;
      }
      const state = context.getState();
      const book = state.project.library.books[bookId];
      if (!book) return;
      const manualCandidate: BookDocumentCandidateOption = {
        id: `qbittorrent-manual:${bookId}:${source}`,
        provider: 'qbittorrent',
        title: book.title,
        sourceUrl: source,
        contentKind: 'unknown',
        accessBasis: 'user_provided',
        confidence: 0.92,
        matchScore: 1,
        qualityScore: 1,
        qualityReason: 'User-provided source.',
      };
      const projectWithSource = {
        ...state.project,
        library: {
          books: {
            ...state.project.library.books,
            [bookId]: { ...book, sourcePath: source },
          },
        },
      };
      context.commitProject('document.manualSource', projectWithSource, {
        documentCandidates: {
          ...state.ui.documentCandidates,
          bookId,
          status: 'acquiring',
          manualSource: source,
          error: null,
        },
      });
      try {
        await acquireCandidate(bookId, manualCandidate.id, [manualCandidate]);
      } catch (error) {
        context.commitUi('document.manualSource', {
          documentCandidates: {
            ...context.getState().ui.documentCandidates,
            bookId,
            status: 'failed',
            error:
              error instanceof Error
                ? error.message
                : 'Could not acquire the manual qBittorrent source.',
          },
        });
      }
    },
    async readBookDocument(bookId: string, documentId: string): Promise<void> {
      const state = context.getState();
      const resolved = bookDocument(state.project, bookId, documentId);
      if (!resolved) return;
      const requestSequence = (documentReadSequence += 1);
      context.commitUi('ui.documentReader', {
        documentReader: {
          bookId,
          documentId,
          status: 'loading',
          title: resolved.document.fileName,
          text: '',
          error: null,
        },
      });
      try {
        const response = await fetch(
          `${bridgeEndpoint(
            state.ui.qbittorrentConnection.baseUrl,
            '/documents/read-text',
          )}?${new URLSearchParams({ path: resolved.document.storagePath }).toString()}`,
        );
        if (!response.ok) throw new Error(await response.text());
        const text = await response.text();
        if (requestSequence !== documentReadSequence) return;
        context.commitUi('ui.documentReader', {
          documentReader: {
            bookId,
            documentId,
            status: 'ready',
            title: resolved.document.fileName,
            text,
            error: null,
          },
        });
      } catch (error) {
        if (requestSequence !== documentReadSequence) return;
        context.commitUi('ui.documentReader', {
          documentReader: {
            bookId,
            documentId,
            status: 'failed',
            title: resolved.document.fileName,
            text: '',
            error:
              error instanceof Error
                ? error.message
                : 'Could not read document text.',
          },
        });
      }
    },
    closeBookDocumentReader(): void {
      documentReadSequence += 1;
      context.commitUi('ui.documentReader', {
        documentReader: {
          bookId: null,
          documentId: null,
          status: 'idle',
          title: '',
          text: '',
          error: null,
        },
      });
    },
  };
}
