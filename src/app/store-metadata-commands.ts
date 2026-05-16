import type {
  BookDocumentRef,
  CreatePlannerStoreOptions,
  PlannerProjectV1,
  PlannerStoreCommands,
} from '../core/types';
import type { StoreCommandContext } from './store-command-context';
import {
  deleteDocumentContent,
  deleteQbittorrentHashes,
  idleCacheEntry,
  metadataClearedBook,
  stalledOrZeroProgressQbittorrentDocuments,
} from './store-document-state';

function torrentHashesForDocuments(documents: BookDocumentRef[]): string[] {
  return documents
    .map((document) => document.torrentHash)
    .filter((hash): hash is string => Boolean(hash));
}

export function createMetadataCommands(
  context: StoreCommandContext,
  services: CreatePlannerStoreOptions,
): Pick<PlannerStoreCommands, 'clearBookMetadata' | 'clearProjectMetadata'> {
  return {
    async clearBookMetadata(bookId, options = {}): Promise<void> {
      const state = context.getState();
      const book = state.project.library.books[bookId];
      if (!book) return;
      const documents = book.documents ?? [];
      const nextProject: PlannerProjectV1 = {
        ...state.project,
        library: {
          books: {
            ...state.project.library.books,
            [bookId]: metadataClearedBook(book),
          },
        },
        enrichmentCache: {
          ...state.project.enrichmentCache,
          [bookId]: idleCacheEntry(bookId),
        },
      };
      context.commitProject('metadata.clearBook', nextProject, {
        documentCandidates: {
          ...state.ui.documentCandidates,
          ...(state.ui.documentCandidates.bookId === bookId
            ? { candidates: [], status: 'idle' as const, error: null }
            : {}),
        },
        banner: {
          tone: 'success',
          message: `Cleared metadata for ${book.title}.`,
        },
      });
      const documentsToDelete = options.deleteContent
        ? documents
        : stalledOrZeroProgressQbittorrentDocuments(documents);
      if (!documentsToDelete.length) return;
      const affectedBookIds = new Set([bookId]);
      const errors = options.deleteContent
        ? await deleteDocumentContent(
            state.project,
            affectedBookIds,
            state.ui.qbittorrentConnection.baseUrl,
            services.qbittorrentService,
            state.ui.qbittorrentConnection,
            documentsToDelete,
          )
        : await deleteQbittorrentHashes(
            state.project,
            affectedBookIds,
            services.qbittorrentService,
            state.ui.qbittorrentConnection,
            torrentHashesForDocuments(documentsToDelete),
          );
      if (errors.length) {
        context.commitUi('metadata.clearBook', {
          banner: {
            tone: 'warn',
            message: `Metadata was cleared, but content deletion failed: ${errors[0]}`,
          },
        });
      }
    },
    async clearProjectMetadata(options = {}): Promise<void> {
      const state = context.getState();
      const bookIds = Object.keys(state.project.library.books);
      const affectedBookIds = new Set(bookIds);
      const documents = bookIds.flatMap(
        (bookId) => state.project.library.books[bookId]?.documents ?? [],
      );
      const books = Object.fromEntries(
        Object.entries(state.project.library.books).map(([bookId, book]) => [
          bookId,
          metadataClearedBook(book),
        ]),
      );
      const enrichmentCache = Object.fromEntries(
        bookIds.map((bookId) => [bookId, idleCacheEntry(bookId)]),
      );
      context.commitProject(
        'metadata.clearProject',
        { ...state.project, library: { books }, enrichmentCache },
        {
          documentCandidates: {
            bookId: null,
            status: 'idle',
            candidates: [],
            error: null,
            manualSource: state.ui.documentCandidates.manualSource,
          },
          banner: {
            tone: 'success',
            message: 'Cleared enrichment and document metadata for all books.',
          },
        },
      );
      const documentsToDelete = options.deleteContent
        ? documents
        : stalledOrZeroProgressQbittorrentDocuments(documents);
      if (!documentsToDelete.length) return;
      const errors = options.deleteContent
        ? await deleteDocumentContent(
            state.project,
            affectedBookIds,
            state.ui.qbittorrentConnection.baseUrl,
            services.qbittorrentService,
            state.ui.qbittorrentConnection,
            documentsToDelete,
          )
        : await deleteQbittorrentHashes(
            state.project,
            affectedBookIds,
            services.qbittorrentService,
            state.ui.qbittorrentConnection,
            torrentHashesForDocuments(documentsToDelete),
          );
      if (errors.length) {
        context.commitUi('metadata.clearProject', {
          banner: {
            tone: 'warn',
            message: `Metadata was cleared, but some content deletion failed: ${errors[0]}`,
          },
        });
      }
    },
  };
}
