import { selectSearchViewModel } from '../app/selectors/search';
import type { AppState, PlannerStore } from '../core/types';
import {
  isCatalogQueryReady,
  isLikelyIsbnQuery,
  MIN_PARTIAL_ISBN_CHARS,
  MIN_TEXT_SEARCH_CHARS,
} from '../infra/book-search';
import { badge, button, card, el, emptyState } from './dom';
import { textInputControl } from './form-controls';

const SEARCH_DEBOUNCE_MS = 260;

const searchDebounceTimers = new WeakMap<
  PlannerStore,
  ReturnType<typeof globalThis.setTimeout>
>();
const draftQueries = new WeakMap<PlannerStore, string>();

function scheduleSearch(store: PlannerStore, query: string): void {
  const timer = searchDebounceTimers.get(store);
  if (timer != null) {
    globalThis.clearTimeout(timer);
  }
  const nextTimer = globalThis.setTimeout(() => {
    void store.commands.searchCatalog(query);
  }, SEARCH_DEBOUNCE_MS);
  searchDebounceTimers.set(store, nextTimer);
}

function currentDraft(store: PlannerStore, state: AppState): string {
  return draftQueries.get(store) ?? state.ui.bookSearchQuery;
}

function searchHint(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) {
    return 'Search Open Library and add books directly from the results.';
  }
  if (isCatalogQueryReady(trimmed)) {
    return 'Search by title, author, or ISBN and add books directly from the results.';
  }
  if (isLikelyIsbnQuery(trimmed)) {
    return `Type at least ${MIN_PARTIAL_ISBN_CHARS} ISBN characters before search runs.`;
  }
  return `Type at least ${MIN_TEXT_SEARCH_CHARS} characters before search runs.`;
}

interface SearchPanelOptions {
  compact?: boolean;
  title?: string;
}

export function renderLibrarySearchPanel(
  state: AppState,
  store: PlannerStore,
  options: SearchPanelOptions = {},
): HTMLElement {
  const compact = options.compact === true;
  const viewModel = selectSearchViewModel(state);
  const draft = currentDraft(store, state);
  const input = textInputControl({
    className: `text-input library-search-input${compact ? ' compact-search-input' : ''}`,
    value: draft,
    focusKey: 'library:search',
    placeholder: 'Search by title, author, or ISBN...',
    onInput: (next) => {
      draftQueries.set(store, next);
      if (!next.trim()) {
        store.commands.clearBookSearch();
        return;
      }
      if (!isCatalogQueryReady(next)) {
        return;
      }
      scheduleSearch(store, next);
    },
  });

  const content =
    viewModel.status === 'loading'
      ? el('div', {
          className: 'muted-copy',
          text: 'Searching Open Library...',
        })
      : viewModel.error
        ? el('div', { className: 'muted-copy', text: viewModel.error })
        : viewModel.results.length
          ? el(
              'div',
              {
                className: `search-results${compact ? ' compact-search-results' : ''}`,
              },
              ...viewModel.results.map(({ suggestion, existingBookId }) =>
                (() => {
                  return el(
                    'div',
                    {
                      className: `search-result-card${compact ? ' compact-search-card' : ''}`,
                    },
                    el(
                      'div',
                      { className: 'search-result-top' },
                      el(
                        'div',
                        { className: 'stack-layout compact-stack' },
                        el('strong', { text: suggestion.title }),
                        suggestion.subtitle
                          ? el('div', {
                              className: 'muted-copy',
                              text: suggestion.subtitle,
                            })
                          : null,
                      ),
                      button(existingBookId ? 'Select' : 'Add', {
                        className: existingBookId
                          ? 'ghost-button'
                          : 'primary-button',
                        onClick: () =>
                          store.commands.addBookFromSuggestion(suggestion),
                      }),
                    ),
                    suggestion.description
                      ? el('div', {
                          className: 'muted-copy',
                          text: compact
                            ? suggestion.description.slice(0, 120)
                            : suggestion.description,
                        })
                      : null,
                    el(
                      'div',
                      { className: 'badge-row compact-badge-row' },
                      existingBookId
                        ? badge('Already in library', 'warn')
                        : null,
                      suggestion.isbn ? badge(`ISBN ${suggestion.isbn}`) : null,
                      suggestion.pages
                        ? badge(`${suggestion.pages} pages`)
                        : null,
                      ...suggestion.subjects
                        .slice(0, 3)
                        .map((subject) => badge(subject)),
                    ),
                  );
                })(),
              ),
              viewModel.hasMore
                ? el(
                    'div',
                    { className: 'toolbar-row' },
                    button('Load more', {
                      className: 'ghost-button',
                      onClick: () => void store.commands.searchCatalogMore(),
                    }),
                  )
                : null,
            )
          : viewModel.query.trim() && viewModel.status === 'success'
            ? emptyState(
                'No matches',
                'Try a broader title, author, or ISBN query.',
              )
            : el('div', { className: 'muted-copy' }, searchHint(draft));

  return card(
    options.title ?? (compact ? 'Quick add' : 'Book search'),
    el(
      'div',
      { className: 'toolbar-row' },
      input,
      button('Search', {
        className: 'ghost-button',
        onClick: () =>
          void store.commands.searchCatalog(currentDraft(store, state)),
      }),
      button('Clear', {
        className: 'ghost-button',
        onClick: () => {
          draftQueries.set(store, '');
          store.commands.clearBookSearch();
        },
      }),
    ),
    content,
  );
}
