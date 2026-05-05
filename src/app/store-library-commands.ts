import { findMatchingBook } from '../core/book-identity';
import { EXAMPLE_BOOK } from '../core/defaults';
import type {
  BookRecord,
  BookSearchSuggestion,
  PlannerProjectV1,
  PlannerStoreCommands,
} from '../core/types';
import {
  removeBookFromActuals,
  removeBookFromDeferred,
} from './calendar-overrides';
import {
  bookFromSuggestion,
  mergeSuggestionIntoBook,
} from './store-book-metadata';
import type { StoreCommandContext } from './store-command-context';
import { nextBookId } from './store-helpers';
import { withBookRelationPatch } from './store-relations';

export function createLibraryCommands(
  context: StoreCommandContext,
): Pick<
  PlannerStoreCommands,
  | 'addBook'
  | 'addBookFromSuggestion'
  | 'updateBook'
  | 'updateBookRelations'
  | 'moveBook'
  | 'removeBook'
> {
  const orderedBooks = (project: PlannerProjectV1): BookRecord[] =>
    Object.values(project.library.books).sort(
      (left, right) =>
        (left.owned === false ? 1 : 0) - (right.owned === false ? 1 : 0) ||
        left.planOrder - right.planOrder ||
        left.short.localeCompare(right.short),
    );

  return {
    addBook(): void {
      const state = context.getState();
      const id = nextBookId(state.project);
      const count = Object.keys(state.project.library.books).length + 1;
      const nextProject: PlannerProjectV1 = {
        ...state.project,
        library: {
          books: {
            ...state.project.library.books,
            [id]: {
              ...EXAMPLE_BOOK,
              id,
              title: `New Book ${count}`,
              short: `Book ${count}`,
              planOrder: count - 1,
            },
          },
        },
      };
      context.commitProject('library.addBook', nextProject, {
        selectedBookId: id,
        activeView: 'library',
        banner: { tone: 'success', message: 'Added a new book draft.' },
      });
    },
    addBookFromSuggestion(suggestion: BookSearchSuggestion): void {
      const state = context.getState();
      const existing = findMatchingBook(state.project, suggestion);
      if (existing) {
        const mergedExisting = mergeSuggestionIntoBook(existing, suggestion);
        const nextProject: PlannerProjectV1 = {
          ...state.project,
          library: {
            books: {
              ...state.project.library.books,
              [existing.id]: mergedExisting,
            },
          },
        };
        context.commitProject('library.addFromSuggestion', nextProject, {
          selectedBookId: existing.id,
          activeView: 'library',
          bookSearchQuery: suggestion.title,
          bookSearchStatus: 'success',
          banner: {
            tone: 'info',
            message: `${suggestion.title} is already in the library. Selected the existing book instead.`,
          },
        });
        void context.refreshBookEnrichment(existing.id);
        return;
      }

      const id = nextBookId(state.project);
      const nextProject: PlannerProjectV1 = {
        ...state.project,
        library: {
          books: {
            ...state.project.library.books,
            [id]: {
              ...bookFromSuggestion(id, suggestion),
              planOrder: Object.keys(state.project.library.books).length,
            },
          },
        },
      };
      context.commitProject('library.addFromSuggestion', nextProject, {
        selectedBookId: id,
        activeView: 'library',
        bookSearchQuery: suggestion.title,
        bookSearchStatus: 'success',
        banner: {
          tone: 'success',
          message: `Added ${suggestion.title} from search.`,
        },
      });
      void context.refreshBookEnrichment(id);
    },
    updateBook(id: string, patch: Partial<BookRecord>): void {
      const state = context.getState();
      const book = state.project.library.books[id];
      if (!book) return;
      const nextProject: PlannerProjectV1 = {
        ...state.project,
        library: {
          books: {
            ...state.project.library.books,
            [id]: {
              ...book,
              ...patch,
              enrichment: {
                ...book.enrichment,
                ...(patch.enrichment ?? {}),
              },
            },
          },
        },
      };
      const relationProject =
        patch.manualPrereqs || patch.manualCoStudy
          ? withBookRelationPatch(nextProject, id, {
              manualPrereqs: patch.manualPrereqs,
              manualCoStudy: patch.manualCoStudy,
            })
          : nextProject;
      context.commitProject('library.updateBook', relationProject, {
        banner: null,
      });
    },
    updateBookRelations(id: string, patch): void {
      context.commitProject(
        'library.relations',
        withBookRelationPatch(context.getState().project, id, patch),
        { banner: null },
      );
    },
    moveBook(id: string, direction: 'up' | 'down'): void {
      const state = context.getState();
      const ordered = orderedBooks(state.project);
      const index = ordered.findIndex((book) => book.id === id);
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (index < 0 || targetIndex < 0 || targetIndex >= ordered.length) return;
      if (ordered[index]?.owned !== ordered[targetIndex]?.owned) return;
      const nextOrdered = [...ordered];
      [nextOrdered[index], nextOrdered[targetIndex]] = [
        nextOrdered[targetIndex],
        nextOrdered[index],
      ];
      const books = { ...state.project.library.books };
      nextOrdered.forEach((book, planOrder) => {
        books[book.id] = { ...books[book.id], planOrder };
      });
      context.commitProject(
        'library.moveBook',
        { ...state.project, library: { books } },
        { selectedBookId: id, banner: null },
      );
    },
    removeBook(id: string): void {
      const state = context.getState();
      if (!state.project.library.books[id]) return;
      const books = { ...state.project.library.books };
      delete books[id];
      const schedule = { ...state.project.manualOverrides.schedule };
      delete schedule[id];
      const enrichmentCache = { ...state.project.enrichmentCache };
      delete enrichmentCache[id];
      const nextProject: PlannerProjectV1 = {
        ...state.project,
        library: { books },
        enrichmentCache,
        manualOverrides: {
          ...state.project.manualOverrides,
          schedule,
          deferred: removeBookFromDeferred(
            state.project.manualOverrides.deferred,
            id,
          ),
          actuals: removeBookFromActuals(
            state.project.manualOverrides.actuals,
            id,
          ),
        },
      };
      context.commitProject('library.removeBook', nextProject, {
        selectedBookId:
          state.ui.selectedBookId === id ? null : state.ui.selectedBookId,
        banner: { tone: 'warn', message: 'Book removed from the project.' },
      });
    },
  };
}
