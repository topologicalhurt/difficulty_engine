import type {
  CreatePlannerStoreOptions,
  PlannerProjectV1,
  PlannerStoreCommands,
  PlannerStoreEvent,
} from '../core/types';
import type { StoreCommandContext } from './store-command-context';
import {
  mergeEnrichmentIntoBook,
  updateEnrichmentCache,
} from './store-helpers';
import { stableEnrichmentCacheKey } from '../infra/enrichment-cache-key';

const ENRICHMENT_STALE_WINDOW_MS = 6 * 60 * 60 * 1_000;
const ENRICHMENT_REFRESH_CONCURRENCY = 4;

interface CreateEnrichmentCommandsOptions {
  context: StoreCommandContext;
  services: CreatePlannerStoreOptions;
  emitEvent(type: PlannerStoreEvent['type'], payload?: PlannerStoreEvent['payload']): void;
}

export function createEnrichmentCommands(
  options: CreateEnrichmentCommandsOptions,
): Pick<PlannerStoreCommands, 'refreshBookEnrichment' | 'refreshAllEnrichment'> {
  const { context, services, emitEvent } = options;

  async function refreshBookEnrichment(bookId: string): Promise<void> {
    const state = context.getState();
    const book = state.project.library.books[bookId];
    if (!book) return;

    const previousCacheEntry = state.project.enrichmentCache[bookId];
    const requestCacheKey = stableEnrichmentCacheKey({
      book,
      sourceSettings: state.project.sourceSettings,
      qbittorrentConnection: state.ui.qbittorrentConnection,
    });
    const startedAt = services.clock.now().toISOString();
    services.logger.info('planner.enrichment.start', { bookId });
    const loadingProject = updateEnrichmentCache(state.project, bookId, {
      status: 'loading',
      cacheKey: requestCacheKey,
      fetchedAt: startedAt,
      error: undefined,
    });
    context.commitProject('enrichment.refreshBook', loadingProject, {
      banner: {
        tone: 'info',
        message: `Refreshing enrichment for ${book.short || book.title}...`,
      },
    });
    emitEvent('enrichment-status-changed', { bookId, status: 'loading' });

    try {
      const response = await services.enrichmentProvider.fetchBook({
        book,
        sourceSettings: state.project.sourceSettings,
        qbittorrentConnection: state.ui.qbittorrentConnection,
      });
      const fetchedAt = services.clock.now().toISOString();
      const latestState = context.getState();
      const currentBook = latestState.project.library.books[bookId] ?? book;
      const latestCacheKey = stableEnrichmentCacheKey({
        book: currentBook,
        sourceSettings: latestState.project.sourceSettings,
        qbittorrentConnection: latestState.ui.qbittorrentConnection,
      });
      if (latestCacheKey !== requestCacheKey) {
        const fallbackStatus =
          previousCacheEntry?.status === 'success' || previousCacheEntry?.data ? 'stale' : 'idle';
        const staleProject = updateEnrichmentCache(latestState.project, bookId, {
          ...(previousCacheEntry ?? {}),
          status: fallbackStatus,
          cacheKey: latestCacheKey,
          error: 'Ignored stale enrichment result because the book or source settings changed during refresh.',
        });
        context.commitProject('enrichment.refreshBook', staleProject);
        emitEvent('enrichment-status-changed', { bookId, status: fallbackStatus });
        return;
      }
      const mergedBook = mergeEnrichmentIntoBook(currentBook, {
        ...response.bookPatch,
        enrichment: {
          ...response.enrichment,
          provenance: {
            ...currentBook.enrichment.provenance,
            chapters: response.enrichment.chapters.length
              ? response.enrichment.provenance?.chapters ?? response.provenance[0]
              : currentBook.enrichment.provenance?.chapters,
            description: response.enrichment.description
              ? response.enrichment.provenance?.description ?? response.provenance[0]
              : currentBook.enrichment.provenance?.description,
            subjects: response.enrichment.olSubjects.length
              ? response.enrichment.provenance?.subjects ?? response.provenance[0]
              : currentBook.enrichment.provenance?.subjects,
          },
        },
      });
      let nextProject: PlannerProjectV1 = {
        ...latestState.project,
        library: {
          books: {
            ...latestState.project.library.books,
            [bookId]: mergedBook,
          },
        },
      };
      nextProject = updateEnrichmentCache(nextProject, bookId, {
        status: 'success',
        cacheKey: response.cacheKey,
        fetchedAt,
        staleAt: new Date(services.clock.now().getTime() + ENRICHMENT_STALE_WINDOW_MS).toISOString(),
        error: undefined,
        data: response.enrichment,
        provenance: response.provenance,
      });
      context.commitProject('enrichment.refreshBook', nextProject, {
        banner: {
          tone: 'success',
          message: `Enrichment refreshed for ${mergedBook.short || mergedBook.title}.`,
        },
      });
      emitEvent('enrichment-status-changed', { bookId, status: 'success' });
    } catch (error) {
      services.logger.warn('planner.enrichment.failed', {
        bookId,
        error: error instanceof Error ? error.message : String(error),
      });
      const latestState = context.getState();
      const currentBook = latestState.project.library.books[bookId] ?? book;
      const latestCacheKey = stableEnrichmentCacheKey({
        book: currentBook,
        sourceSettings: latestState.project.sourceSettings,
        qbittorrentConnection: latestState.ui.qbittorrentConnection,
      });
      if (latestCacheKey !== requestCacheKey) {
        const fallbackStatus =
          previousCacheEntry?.status === 'success' || previousCacheEntry?.data ? 'stale' : 'idle';
        const staleProject = updateEnrichmentCache(latestState.project, bookId, {
          ...(previousCacheEntry ?? {}),
          status: fallbackStatus,
          cacheKey: latestCacheKey,
          error: 'Ignored stale enrichment failure because the book or source settings changed during refresh.',
        });
        context.commitProject('enrichment.refreshBook', staleProject);
        emitEvent('enrichment-status-changed', { bookId, status: fallbackStatus });
        return;
      }
      const currentEntry = latestState.project.enrichmentCache[bookId];
      const hasUsablePreviousData = previousCacheEntry?.status === 'success' || Boolean(previousCacheEntry?.data);
      const failedProject = updateEnrichmentCache(latestState.project, bookId, {
        status: hasUsablePreviousData || currentEntry?.status === 'success' ? 'stale' : 'failed',
        error: error instanceof Error ? error.message : 'Unknown enrichment failure',
      });
      context.commitProject('enrichment.refreshBook', failedProject, {
        banner: {
          tone: 'warn',
          message:
            error instanceof Error
              ? `Enrichment failed for ${book.short || book.title}: ${error.message}`
              : `Enrichment failed for ${book.short || book.title}.`,
        },
      });
      emitEvent('enrichment-status-changed', {
        bookId,
        status: failedProject.enrichmentCache[bookId]?.status ?? 'failed',
      });
    }
  }

  return {
    refreshBookEnrichment,
    async refreshAllEnrichment(): Promise<void> {
      const bookIds = Object.keys(context.getState().project.library.books);
      let nextIndex = 0;
      const workers = Array.from(
        { length: Math.min(ENRICHMENT_REFRESH_CONCURRENCY, bookIds.length) },
        async () => {
          while (nextIndex < bookIds.length) {
            const bookId = bookIds[nextIndex];
            nextIndex += 1;
            if (bookId) await refreshBookEnrichment(bookId);
          }
        },
      );
      await Promise.all(workers);
    },
  };
}
