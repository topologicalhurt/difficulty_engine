import type {
  BookRecord,
  CreatePlannerStoreOptions,
  EnrichmentResponse,
  PlannerProjectV1,
  PlannerStoreCommands,
  PlannerStoreEvent,
} from '../core/types';
import type { StoreCommandContext } from './store-command-context';
import {
  applySuccessfulEnrichmentRefresh,
  type AppliedRefreshResult,
} from './store-enrichment-apply';
import { updateEnrichmentCache } from './store-helpers';
import {
  deleteDocumentContent,
  deleteQbittorrentHashes,
} from './store-document-state';
import { isoTimestamp } from '../infra/cache-time';
import { stableEnrichmentCacheKey } from '../infra/enrichment-cache-key';

const ENRICHMENT_STALE_WINDOW_MS = 6 * 60 * 60 * 1_000;
const ENRICHMENT_REFRESH_CONCURRENCY = 4;

interface CreateEnrichmentCommandsOptions {
  context: StoreCommandContext;
  services: CreatePlannerStoreOptions;
  emitEvent(
    type: PlannerStoreEvent['type'],
    payload?: PlannerStoreEvent['payload'],
  ): void;
}

type EnrichmentCacheEntry = PlannerProjectV1['enrichmentCache'][string];
type StoreState = ReturnType<StoreCommandContext['getState']>;

interface RefreshRequestContext {
  bookId: string;
  book: BookRecord;
  previousCacheEntry: EnrichmentCacheEntry | undefined;
  requestSequence: number;
  requestCacheKey: string;
}

interface RefreshFetchResult {
  request: RefreshRequestContext;
  response?: EnrichmentResponse;
  error?: unknown;
}

export function createEnrichmentCommands(
  options: CreateEnrichmentCommandsOptions,
): Pick<
  PlannerStoreCommands,
  'refreshBookEnrichment' | 'refreshAllEnrichment'
> {
  const { context, services, emitEvent } = options;
  const activeRefreshSequenceByBook = new Map<string, number>();
  const nowMs = (): number => services.clock.now().getTime();

  function nextRefreshSequence(bookId: string): number {
    const next = (activeRefreshSequenceByBook.get(bookId) ?? 0) + 1;
    activeRefreshSequenceByBook.set(bookId, next);
    return next;
  }

  function requestIsCurrent(bookId: string, sequence: number): boolean {
    return activeRefreshSequenceByBook.get(bookId) === sequence;
  }

  function fallbackStatusForPrevious(
    previousCacheEntry: EnrichmentCacheEntry | undefined,
  ): 'stale' | 'idle' {
    return previousCacheEntry?.status === 'success' || previousCacheEntry?.data
      ? 'stale'
      : 'idle';
  }

  function commitCacheStatus(
    project: PlannerProjectV1,
    uiPatch: Parameters<StoreCommandContext['commitProject']>[2] = {},
  ): void {
    context.commitProject('enrichment.cacheStatus', project, uiPatch, false);
  }

  function applySuccessfulRefresh(
    project: PlannerProjectV1,
    bookId: string,
    response: EnrichmentResponse,
    fetchedAt: string,
  ): AppliedRefreshResult {
    return applySuccessfulEnrichmentRefresh({
      project,
      bookId,
      response,
      fetchedAt,
      staleWindowMs: ENRICHMENT_STALE_WINDOW_MS,
      nowMs,
    });
  }

  function commitIgnoredStaleRefresh(
    bookId: string,
    latestState: StoreState,
    previousCacheEntry: EnrichmentCacheEntry | undefined,
    latestCacheKey: string,
    error: string,
  ): void {
    const fallbackStatus = fallbackStatusForPrevious(previousCacheEntry);
    const staleProject = updateEnrichmentCache(latestState.project, bookId, {
      ...(previousCacheEntry ?? {}),
      status: fallbackStatus,
      cacheKey: latestCacheKey,
      error,
    });
    commitCacheStatus(staleProject);
    emitEvent('enrichment-status-changed', {
      bookId,
      status: fallbackStatus,
    });
  }

  async function refreshBookEnrichment(bookId: string): Promise<void> {
    const state = context.getState();
    const book = state.project.library.books[bookId];
    if (!book) return;

    const previousCacheEntry = state.project.enrichmentCache[bookId];
    const requestSequence = nextRefreshSequence(bookId);
    const requestCacheKey = stableEnrichmentCacheKey({
      book,
      sourceSettings: state.project.sourceSettings,
      qbittorrentConnection: state.ui.qbittorrentConnection,
    });
    const startedAt = isoTimestamp(nowMs);
    services.logger.info('planner.enrichment.start', { bookId });
    const loadingProject = updateEnrichmentCache(state.project, bookId, {
      status: 'loading',
      cacheKey: requestCacheKey,
      fetchedAt: startedAt,
      error: undefined,
    });
    commitCacheStatus(loadingProject, {
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
      const fetchedAt = isoTimestamp(nowMs);
      const latestState = context.getState();
      if (!requestIsCurrent(bookId, requestSequence)) return;
      const currentBook = latestState.project.library.books[bookId] ?? book;
      const latestCacheKey = stableEnrichmentCacheKey({
        book: currentBook,
        sourceSettings: latestState.project.sourceSettings,
        qbittorrentConnection: latestState.ui.qbittorrentConnection,
      });
      if (latestCacheKey !== requestCacheKey) {
        commitIgnoredStaleRefresh(
          bookId,
          latestState,
          previousCacheEntry,
          latestCacheKey,
          'Ignored stale enrichment result because the book or source settings changed during refresh.',
        );
        return;
      }
      const applied = applySuccessfulRefresh(
        latestState.project,
        bookId,
        response,
        fetchedAt,
      );
      const mergedBook =
        applied.project.library.books[bookId] ?? currentBook;
      context.commitProject('enrichment.refreshBook', applied.project, {
        banner: {
          tone: 'success',
          message: `Enrichment refreshed for ${mergedBook.short || mergedBook.title}.`,
        },
      });
      if (applied.replacedDocuments.length) {
        const deleteErrors = await deleteDocumentContent(
          applied.project,
          new Set([bookId]),
          latestState.ui.qbittorrentConnection.baseUrl,
          services.qbittorrentService,
          latestState.ui.qbittorrentConnection,
          applied.replacedDocuments,
        );
        if (deleteErrors.length) {
          context.commitUi('enrichment.refreshBook', {
            banner: {
              tone: 'warn',
              message: `Enrichment succeeded, but old qBittorrent cleanup failed: ${deleteErrors[0]}`,
            },
          });
        }
      }
      if (applied.replacedHashes.length) {
        const deleteErrors = await deleteQbittorrentHashes(
          applied.project,
          new Set([bookId]),
          services.qbittorrentService,
          latestState.ui.qbittorrentConnection,
          applied.replacedHashes,
        );
        if (deleteErrors.length) {
          context.commitUi('enrichment.refreshBook', {
            banner: {
              tone: 'warn',
              message: `Enrichment succeeded, but old qBittorrent cleanup failed: ${deleteErrors[0]}`,
            },
          });
        }
      }
      emitEvent('enrichment-status-changed', { bookId, status: 'success' });
    } catch (error) {
      services.logger.warn('planner.enrichment.failed', {
        bookId,
        error: error instanceof Error ? error.message : String(error),
      });
      const latestState = context.getState();
      if (!requestIsCurrent(bookId, requestSequence)) return;
      const currentBook = latestState.project.library.books[bookId] ?? book;
      const latestCacheKey = stableEnrichmentCacheKey({
        book: currentBook,
        sourceSettings: latestState.project.sourceSettings,
        qbittorrentConnection: latestState.ui.qbittorrentConnection,
      });
      if (latestCacheKey !== requestCacheKey) {
        commitIgnoredStaleRefresh(
          bookId,
          latestState,
          previousCacheEntry,
          latestCacheKey,
          'Ignored stale enrichment failure because the book or source settings changed during refresh.',
        );
        return;
      }
      const currentEntry = latestState.project.enrichmentCache[bookId];
      const hasUsablePreviousData =
        previousCacheEntry?.status === 'success' ||
        Boolean(previousCacheEntry?.data);
      const failedProject = updateEnrichmentCache(latestState.project, bookId, {
        status:
          hasUsablePreviousData || currentEntry?.status === 'success'
            ? 'stale'
            : 'failed',
        error:
          error instanceof Error ? error.message : 'Unknown enrichment failure',
      });
      commitCacheStatus(failedProject, {
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
      const initialState = context.getState();
      const requests = Object.keys(initialState.project.library.books)
        .map((bookId): RefreshRequestContext | null => {
          const book = initialState.project.library.books[bookId];
          if (!book) return null;
          return {
            bookId,
            book,
            previousCacheEntry: initialState.project.enrichmentCache[bookId],
            requestSequence: nextRefreshSequence(bookId),
            requestCacheKey: stableEnrichmentCacheKey({
              book,
              sourceSettings: initialState.project.sourceSettings,
              qbittorrentConnection: initialState.ui.qbittorrentConnection,
            }),
          };
        })
        .filter((request): request is RefreshRequestContext =>
          Boolean(request),
        );
      if (!requests.length) return;
      const startedAt = isoTimestamp(nowMs);
      const loadingProject = requests.reduce(
        (project, request) =>
          updateEnrichmentCache(project, request.bookId, {
            status: 'loading',
            cacheKey: request.requestCacheKey,
            fetchedAt: startedAt,
            error: undefined,
          }),
        initialState.project,
      );
      commitCacheStatus(loadingProject, {
        banner: {
          tone: 'info',
          message: `Refreshing enrichment for ${requests.length} books...`,
        },
      });
      requests.forEach((request) => {
        services.logger.info('planner.enrichment.start', {
          bookId: request.bookId,
        });
        emitEvent('enrichment-status-changed', {
          bookId: request.bookId,
          status: 'loading',
        });
      });

      let nextIndex = 0;
      const results: RefreshFetchResult[] = new Array(requests.length);
      const workers = Array.from(
        { length: Math.min(ENRICHMENT_REFRESH_CONCURRENCY, requests.length) },
        async () => {
          while (nextIndex < requests.length) {
            const resultIndex = nextIndex;
            const request = requests[resultIndex];
            nextIndex += 1;
            if (!request) continue;
            try {
              results[resultIndex] = {
                request,
                response: await services.enrichmentProvider.fetchBook({
                  book: request.book,
                  sourceSettings: initialState.project.sourceSettings,
                  qbittorrentConnection: initialState.ui.qbittorrentConnection,
                }),
              };
            } catch (error) {
              services.logger.warn('planner.enrichment.failed', {
                bookId: request.bookId,
                error: error instanceof Error ? error.message : String(error),
              });
              results[resultIndex] = { request, error };
            }
          }
        },
      );
      await Promise.all(workers);

      let nextProject = context.getState().project;
      const cleanupDocuments: NonNullable<BookRecord['documents']> = [];
      const cleanupHashes = new Set<string>();
      const affectedBookIds = new Set<string>();
      let successCount = 0;
      let failureCount = 0;
      for (const result of results) {
        const { request } = result;
        if (!requestIsCurrent(request.bookId, request.requestSequence)) {
          continue;
        }
        const currentBook = nextProject.library.books[request.bookId];
        if (!currentBook) continue;
        const latestState = context.getState();
        const latestCacheKey = stableEnrichmentCacheKey({
          book: currentBook,
          sourceSettings: nextProject.sourceSettings,
          qbittorrentConnection: latestState.ui.qbittorrentConnection,
        });
        if (latestCacheKey !== request.requestCacheKey) {
          const fallbackStatus = fallbackStatusForPrevious(
            request.previousCacheEntry,
          );
          nextProject = updateEnrichmentCache(nextProject, request.bookId, {
            ...(request.previousCacheEntry ?? {}),
            status: fallbackStatus,
            cacheKey: latestCacheKey,
            error:
              'Ignored stale enrichment result because the book or source settings changed during refresh.',
          });
          emitEvent('enrichment-status-changed', {
            bookId: request.bookId,
            status: fallbackStatus,
          });
          continue;
        }
        if (result.response) {
          const applied = applySuccessfulRefresh(
            nextProject,
            request.bookId,
            result.response,
            isoTimestamp(nowMs),
          );
          nextProject = applied.project;
          cleanupDocuments.push(...applied.replacedDocuments);
          applied.replacedHashes.forEach((hash) => cleanupHashes.add(hash));
          affectedBookIds.add(request.bookId);
          successCount += 1;
          emitEvent('enrichment-status-changed', {
            bookId: request.bookId,
            status: 'success',
          });
          continue;
        }
        const currentEntry = nextProject.enrichmentCache[request.bookId];
        const hasUsablePreviousData =
          request.previousCacheEntry?.status === 'success' ||
          Boolean(request.previousCacheEntry?.data);
        const status =
          hasUsablePreviousData || currentEntry?.status === 'success'
            ? 'stale'
            : 'failed';
        nextProject = updateEnrichmentCache(nextProject, request.bookId, {
          ...(request.previousCacheEntry ?? {}),
          status,
          error:
            result.error instanceof Error
              ? result.error.message
              : 'Unknown enrichment failure',
        });
        failureCount += 1;
        emitEvent('enrichment-status-changed', {
          bookId: request.bookId,
          status,
        });
      }

      if (nextProject !== context.getState().project) {
        context.commitProject('enrichment.refreshAll', nextProject, {
          banner: {
            tone: failureCount ? 'warn' : 'success',
            message: failureCount
              ? `Enrichment finished: ${successCount} refreshed, ${failureCount} failed or stale.`
              : `Enrichment refreshed for ${successCount} books.`,
          },
        });
      }

      const latestState = context.getState();
      if (cleanupDocuments.length) {
        const deleteErrors = await deleteDocumentContent(
          latestState.project,
          affectedBookIds,
          latestState.ui.qbittorrentConnection.baseUrl,
          services.qbittorrentService,
          latestState.ui.qbittorrentConnection,
          cleanupDocuments,
        );
        if (deleteErrors.length) {
          context.commitUi('enrichment.refreshAll', {
            banner: {
              tone: 'warn',
              message: `Enrichment succeeded, but old qBittorrent cleanup failed: ${deleteErrors[0]}`,
            },
          });
        }
      }
      if (cleanupHashes.size) {
        const deleteErrors = await deleteQbittorrentHashes(
          latestState.project,
          affectedBookIds,
          services.qbittorrentService,
          latestState.ui.qbittorrentConnection,
          [...cleanupHashes],
        );
        if (deleteErrors.length) {
          context.commitUi('enrichment.refreshAll', {
            banner: {
              tone: 'warn',
              message: `Enrichment succeeded, but old qBittorrent cleanup failed: ${deleteErrors[0]}`,
            },
          });
        }
      }
    },
  };
}
