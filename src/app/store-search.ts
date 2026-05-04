import type { AppState, CreatePlannerStoreOptions, UiState } from '../core/types';
import { DEFAULT_SEARCH_PAGE_SIZE, isCatalogQueryReady } from '../infra/book-search';

interface CreateCatalogSearchRunnerOptions {
  getState: () => AppState;
  commitUi: (uiPatch: Partial<UiState>) => void;
  enrichmentProvider: CreatePlannerStoreOptions['enrichmentProvider'];
}

export function createCatalogSearchRunner(options: CreateCatalogSearchRunnerOptions) {
  let searchRequestId = 0;

  return async function runCatalogSearch(rawQuery?: string, append = false): Promise<void> {
    const state = options.getState();
    const query = (rawQuery ?? state.ui.bookSearchQuery).trim();
    if (!query) {
      options.commitUi({
        bookSearchQuery: '',
        bookSearchStatus: 'idle',
        bookSearchResults: [],
        bookSearchHasMore: false,
        bookSearchOffset: 0,
        bookSearchError: null,
      });
      return;
    }
    if (!isCatalogQueryReady(query)) {
      options.commitUi({
        bookSearchQuery: query,
        bookSearchStatus: 'idle',
        bookSearchResults: [],
        bookSearchHasMore: false,
        bookSearchOffset: 0,
        bookSearchError: null,
      });
      return;
    }

    const requestId = ++searchRequestId;
    options.commitUi({
      bookSearchQuery: query,
      bookSearchStatus: 'loading',
      bookSearchResults: append ? state.ui.bookSearchResults : [],
      bookSearchError: null,
    });

    try {
      const response = await options.enrichmentProvider.searchBooks({
        query,
        sourceSettings: state.project.sourceSettings,
        offset: append ? state.ui.bookSearchOffset : 0,
        limit: DEFAULT_SEARCH_PAGE_SIZE,
      });
      if (requestId !== searchRequestId) {
        return;
      }
      const latestState = options.getState();
      if (latestState.ui.bookSearchQuery.trim() !== query) {
        return;
      }
      const existing = append ? latestState.ui.bookSearchResults : [];
      const mergedResults = append
        ? [...existing, ...response.results.filter((next) => !existing.some((current) => current.key === next.key))]
        : response.results;
      options.commitUi({
        bookSearchQuery: query,
        bookSearchStatus: 'success',
        bookSearchResults: mergedResults,
        bookSearchHasMore: response.hasMore,
        bookSearchOffset: response.nextOffset,
        bookSearchError: null,
      });
    } catch (error) {
      if (requestId !== searchRequestId) {
        return;
      }
      if (options.getState().ui.bookSearchQuery.trim() !== query) {
        return;
      }
      options.commitUi({
        bookSearchQuery: query,
        bookSearchStatus: 'failed',
        bookSearchResults: [],
        bookSearchHasMore: false,
        bookSearchOffset: 0,
        bookSearchError: error instanceof Error ? error.message : 'Search failed.',
      });
    }
  };
}
