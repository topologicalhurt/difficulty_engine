import type { PlannerStoreCommands } from '../core/types';
import {
  withCalendarEntryDone,
  withCalendarEntryMinutes,
  withCalendarEntryPages,
  withDeferredCalendarEntry,
  withoutCalendarEntryOverride,
} from './calendar-overrides';
import type { StoreCommandContext } from './store-command-context';

export function createCalendarCommands(
  context: StoreCommandContext,
): Pick<
  PlannerStoreCommands,
  | 'deferCalendarEntry'
  | 'markCalendarEntryDone'
  | 'setCalendarEntryMinutes'
  | 'setCalendarEntryPages'
  | 'clearCalendarEntryActual'
> {
  return {
    deferCalendarEntry(dateKey: string, bookId: string): void {
      const state = context.getState();
      if (state.project.library.books[bookId]) {
        context.commitProject(
          'calendar.defer',
          withDeferredCalendarEntry(state.project, dateKey, bookId),
        );
      }
    },
    markCalendarEntryDone(dateKey: string, bookId: string, done = true): void {
      const state = context.getState();
      if (state.project.library.books[bookId]) {
        context.commitProject(
          'calendar.done',
          withCalendarEntryDone(state.project, dateKey, bookId, done),
        );
      }
    },
    setCalendarEntryMinutes(dateKey: string, bookId: string, minutes: number): void {
      const state = context.getState();
      if (state.project.library.books[bookId]) {
        context.commitProject(
          'calendar.minutes',
          withCalendarEntryMinutes(state.project, dateKey, bookId, minutes),
        );
      }
    },
    setCalendarEntryPages(dateKey: string, bookId: string, pages: number): void {
      const state = context.getState();
      if (state.project.library.books[bookId]) {
        context.commitProject(
          'calendar.pages',
          withCalendarEntryPages(state.project, dateKey, bookId, pages),
        );
      }
    },
    clearCalendarEntryActual(dateKey: string, bookId: string): void {
      context.commitProject(
        'calendar.clearActual',
        withoutCalendarEntryOverride(context.getState().project, dateKey, bookId),
      );
    },
  };
}
