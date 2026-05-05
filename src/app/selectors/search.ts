import { findMatchingBook } from '../../core/book-identity';
import type {
  AppState,
  BookSearchStatus,
  BookSearchSuggestion,
} from '../../core/types';

export interface SearchResultView {
  suggestion: BookSearchSuggestion;
  existingBookId: string | null;
}

export interface SearchViewModel {
  query: string;
  status: BookSearchStatus;
  error: string | null;
  hasMore: boolean;
  results: SearchResultView[];
}

export function selectSearchViewModel(state: AppState): SearchViewModel {
  return {
    query: state.ui.bookSearchQuery,
    status: state.ui.bookSearchStatus,
    error: state.ui.bookSearchError,
    hasMore: state.ui.bookSearchHasMore,
    results: state.ui.bookSearchResults.map((suggestion) => ({
      suggestion,
      existingBookId: findMatchingBook(state.project, suggestion)?.id ?? null,
    })),
  };
}
