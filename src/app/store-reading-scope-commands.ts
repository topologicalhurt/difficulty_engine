import type { PlannerStoreCommands, ReadingScopeSettings } from '../core/types';
import { normalizeBookReadingScope } from '../core/project-normalize-reading-scope';
import { readingScopeSettingsForProject } from '../core/reading-scope';
import type { StoreCommandContext } from './store-command-context';

export function createReadingScopeCommands(
  context: StoreCommandContext,
): Pick<
  PlannerStoreCommands,
  'updateBookReadingScope' | 'updateReadingScopeSettings'
> {
  return {
    updateBookReadingScope(id, patch): void {
      const state = context.getState();
      const book = state.project.library.books[id];
      if (!book) return;
      const readingScope = normalizeBookReadingScope({
        ...(book.readingScope ?? {}),
        ...patch,
      });
      context.commitProject(
        'readingScope.book',
        {
          ...state.project,
          library: {
            books: {
              ...state.project.library.books,
              [id]: { ...book, readingScope },
            },
          },
        },
        { banner: { tone: 'success', message: `Updated scope for ${book.short}.` } },
      );
    },
    updateReadingScopeSettings(
      patch: Partial<ReadingScopeSettings>,
    ): void {
      const state = context.getState();
      context.commitProject(
        'readingScope.project',
        {
          ...state.project,
          readingScopeSettings: {
            ...readingScopeSettingsForProject(state.project),
            ...patch,
          },
        },
        {
          banner: {
            tone: 'success',
            message: 'Updated global reading scope.',
          },
        },
      );
    },
  };
}
