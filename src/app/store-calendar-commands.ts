import type { PlannerStoreCommands } from '../core/types';
import { round1 } from '../core/utils';
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
        const entry = state.snapshot.dayPlan.byDate[dateKey]?.find(
          (candidate) => candidate.bookId === bookId,
        );
        context.commitProject(
          'calendar.done',
          withCalendarEntryDone(
            state.project,
            dateKey,
            bookId,
            done,
            entry
              ? {
                  minutes: entry.mins,
                  pages: round1(entry.readPages + entry.skimPages),
                }
              : undefined,
          ),
        );
      }
    },
    setCalendarEntryMinutes(
      dateKey: string,
      bookId: string,
      minutes: number,
    ): void {
      const state = context.getState();
      if (state.project.library.books[bookId]) {
        context.commitProject(
          'calendar.minutes',
          withCalendarEntryMinutes(state.project, dateKey, bookId, minutes),
        );
      }
    },
    setCalendarEntryPages(
      dateKey: string,
      bookId: string,
      pages: number,
    ): void {
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
        withoutCalendarEntryOverride(
          context.getState().project,
          dateKey,
          bookId,
        ),
      );
    },
  };
}
