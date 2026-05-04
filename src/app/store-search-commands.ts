import type { PlannerStoreCommands } from '../core/types';
import type { StoreCommandContext } from './store-command-context';

export function createSearchCommands(
  context: StoreCommandContext,
): Pick<
  PlannerStoreCommands,
  'setBookSearchQuery' | 'clearBookSearch' | 'searchCatalog' | 'searchCatalogMore'
> {
  return {
    setBookSearchQuery(query: string): void {
      const state = context.getState();
      context.commitUi('search.query', {
        bookSearchQuery: query,
        bookSearchStatus: query.trim() ? state.ui.bookSearchStatus : 'idle',
        bookSearchHasMore: query.trim() ? state.ui.bookSearchHasMore : false,
        bookSearchOffset: query.trim() ? state.ui.bookSearchOffset : 0,
        bookSearchError: query.trim() ? state.ui.bookSearchError : null,
        bookSearchResults: query.trim() ? state.ui.bookSearchResults : [],
      });
    },
    clearBookSearch(): void {
      context.commitUi('search.clear', {
        bookSearchQuery: '',
        bookSearchStatus: 'idle',
        bookSearchResults: [],
        bookSearchHasMore: false,
        bookSearchOffset: 0,
        bookSearchError: null,
      });
    },
    searchCatalog(query?: string): Promise<void> {
      return context.runCatalogSearch(query, false);
    },
    searchCatalogMore(): Promise<void> {
      const state = context.getState();
      if (!state.ui.bookSearchHasMore || state.ui.bookSearchStatus === 'loading') {
        return Promise.resolve();
      }
      return context.runCatalogSearch(state.ui.bookSearchQuery, true);
    },
  };
}
