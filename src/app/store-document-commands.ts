import type {
  BookDocumentCandidateOption,
  BookDocumentRef,
  CreatePlannerStoreOptions,
  PlannerProjectV1,
  PlannerStoreCommands,
} from '../core/types';
import { bridgeEndpoint } from '../infra/document-bridge-url';
import type { StoreCommandContext } from './store-command-context';
import {
  documentGreylistKey,
  documentRefGreylistKey,
  documentRefIsGreylistable,
} from '../core/document-acquisition-state';
import {
  bookCandidateContextKey,
  deleteDocumentContent,
  postDocumentAction,
  projectWithCandidateQueue,
  projectWithDocumentAdded,
  projectWithDocumentRemoved,
} from './store-document-state';

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
): {
  book: PlannerProjectV1['library']['books'][string];
  document: BookDocumentRef;
} | null {
  const book = project.library.books[bookId];
  const document = book?.documents?.find((item) => item.id === documentId);
  return book && document ? { book, document } : null;
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
    const beforeProject = context.getState().project;
    const beforeBook = beforeProject.library.books[bookId];
    const newKey = documentRefGreylistKey(document);
    const replacedDocuments =
      document.provider === 'qbittorrent' &&
      document.status !== 'failed' &&
      document.status !== 'stalled'
        ? (beforeBook?.documents ?? []).filter((existing) => {
            const existingKey = documentRefGreylistKey(existing);
            return (
              existing.provider === 'qbittorrent' &&
              existingKey !== newKey &&
              (documentRefIsGreylistable(existing) ||
                beforeBook?.documentAcquisition?.greylist[existingKey])
            );
          })
        : [];
    const nextProject = projectWithDocumentAdded(beforeProject, bookId, document);
    context.commitProject(
      'document.selectCandidate',
      nextProject,
      {
        documentCandidates: {
          ...context.getState().ui.documentCandidates,
          bookId,
          status: 'ready',
          candidates:
            nextProject.library.books[bookId]?.documentAcquisition
              ?.candidateQueue ?? [],
          error: null,
        },
        banner: {
          tone: 'success',
          message: `Started ${document.fileName}.`,
        },
      },
    );
    if (replacedDocuments.length) {
      const deleteErrors = await deleteDocumentContent(
        beforeProject,
        new Set([bookId]),
        state.ui.qbittorrentConnection.baseUrl,
        services.qbittorrentService,
        state.ui.qbittorrentConnection,
        replacedDocuments,
      );
      if (deleteErrors.length) {
        context.commitUi('document.selectCandidate', {
          banner: {
            tone: 'warn',
            message: `Started ${document.fileName}, but old content cleanup failed: ${deleteErrors[0]}`,
          },
        });
      }
    }
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
        const errors = await deleteDocumentContent(
          state.project,
          new Set([bookId]),
          state.ui.qbittorrentConnection.baseUrl,
          services.qbittorrentService,
          state.ui.qbittorrentConnection,
          [document],
        );
        if (errors.length) throw new Error(errors[0]);
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
      const contextKey = bookCandidateContextKey(book);
      context.commitUi('document.candidates', {
        documentCandidates: {
          bookId,
          status: 'loading',
          candidates: book.documentAcquisition?.candidateQueue ?? [],
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
        const currentBook =
          context.getState().project.library.books[bookId];
        if (!currentBook || bookCandidateContextKey(currentBook) !== contextKey) {
          return;
        }
        const nextProject = projectWithCandidateQueue(
          context.getState().project,
          bookId,
          candidates,
        );
        const queue =
          nextProject.library.books[bookId]?.documentAcquisition
            ?.candidateQueue ?? [];
        context.commitProject('document.candidates', nextProject, {
          documentCandidates: {
            bookId,
            status: 'ready',
            candidates: queue,
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
          : (state.project.library.books[bookId]?.documentAcquisition
              ?.candidateQueue ?? []);
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
        greylistKey: documentGreylistKey({ sourceUrl: source }),
        retryable: true,
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
      const nextProject = projectWithCandidateQueue(projectWithSource, bookId, [
        manualCandidate,
      ]);
      context.commitProject(
        'document.manualSource',
        nextProject,
        {
          documentCandidates: {
            ...state.ui.documentCandidates,
            bookId,
            status: 'acquiring',
            candidates:
              nextProject.library.books[bookId]?.documentAcquisition
                ?.candidateQueue ?? [],
            manualSource: source,
            error: null,
          },
        },
      );
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
