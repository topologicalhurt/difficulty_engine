import type { AppState, BookRecord, CalendarEntry } from '../../core/types';
import { round1 } from '../../core/utils';

export type ProgressStatus =
  | 'not_started'
  | 'in_progress'
  | 'complete'
  | 'ignored';

export interface BookProgressView {
  bookId: string;
  totalPages: number;
  readPages: number;
  remainingPages: number;
  percent: number;
  loggedMinutes: number;
  doneEntries: number;
  status: ProgressStatus;
  label: string;
  detail: string;
}

export interface OverallProgressView {
  totalPages: number;
  readPages: number;
  remainingPages: number;
  percent: number;
  totalBooks: number;
  completeBooks: number;
  inProgressBooks: number;
  label: string;
  detail: string;
}

export interface ProgressSummaryView {
  byBook: Record<string, BookProgressView>;
  overall: OverallProgressView;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function progressPagesForEntry(entry: CalendarEntry): number {
  if (!entry.done && !entry.actualOverride) return 0;
  return Math.max(0, entry.actualPages ?? entry.readPages + entry.skimPages);
}

function progressMinutesForEntry(entry: CalendarEntry): number {
  if (entry.actualMinutes != null) return Math.max(0, entry.actualMinutes);
  return entry.done ? Math.max(0, entry.mins) : 0;
}

type CalendarEntryWithDate = CalendarEntry & { dateStr: string };
type LoggedProgress = { pages: number; minutes: number; count: number };

function emptyLoggedProgress(): LoggedProgress {
  return { pages: 0, minutes: 0, count: 0 };
}

function calendarEntryLookup(
  byBook: AppState['snapshot']['dayPlan']['byBook'],
): Map<string, Map<string, CalendarEntryWithDate>> {
  const lookup = new Map<string, Map<string, CalendarEntryWithDate>>();
  Object.entries(byBook).forEach(([bookId, entries]) => {
    lookup.set(
      bookId,
      new Map(entries.map((entry) => [entry.dateStr, entry])),
    );
  });
  return lookup;
}

function loggedProgressByBook(state: AppState): Record<string, LoggedProgress> {
  const entryLookup = calendarEntryLookup(state.snapshot.dayPlan.byBook);
  const progressByBook: Record<string, LoggedProgress> = {};
  Object.entries(state.project.manualOverrides.actuals).forEach(
    ([dateKey, byBook]) => {
      Object.entries(byBook).forEach(([bookId, override]) => {
        const progress = (progressByBook[bookId] ??= emptyLoggedProgress());
        const matchingEntry = entryLookup.get(bookId)?.get(dateKey);
        const pages =
          override.pages ??
          (override.done && matchingEntry
            ? progressPagesForEntry(matchingEntry)
            : 0);
        const minutes =
          override.minutes ??
          (override.done && matchingEntry
            ? progressMinutesForEntry(matchingEntry)
            : 0);
        progress.pages += Math.max(0, pages);
        progress.minutes += Math.max(0, minutes);
        progress.count += 1;
      });
    },
  );
  return progressByBook;
}

function progressStatus(
  ignored: boolean,
  readPages: number,
  totalPages: number,
): ProgressStatus {
  if (ignored) return 'ignored';
  if (totalPages > 0 && readPages >= totalPages - 0.05) return 'complete';
  if (readPages > 0) return 'in_progress';
  return 'not_started';
}

function progressForBook(
  book: BookRecord | undefined,
  bookId: string,
  logged: LoggedProgress,
): BookProgressView {
  const totalPages = Math.max(0, book?.pages ?? 0);
  const readPages = book?.completed
    ? totalPages
    : Math.min(totalPages, round1(logged.pages));
  const remainingPages = Math.max(0, round1(totalPages - readPages));
  const percent = totalPages
    ? clampPercent(round1((readPages / totalPages) * 100))
    : 0;
  const status = progressStatus(Boolean(book?.ignored), readPages, totalPages);
  const label = `${round1(readPages)} / ${round1(totalPages)} pages`;
  const detail =
    status === 'complete'
      ? 'Complete'
      : status === 'ignored'
        ? 'Ignored in the active plan'
        : logged.count
          ? `${logged.count} logged calendar entr${logged.count === 1 ? 'y' : 'ies'}`
          : 'No logged progress yet';

  return {
    bookId,
    totalPages,
    readPages,
    remainingPages,
    percent,
    loggedMinutes: round1(logged.minutes),
    doneEntries: logged.count,
    status,
    label,
    detail,
  };
}

export function selectProgressByBook(
  state: AppState,
): Record<string, BookProgressView> {
  const logged = loggedProgressByBook(state);
  return Object.fromEntries(
    Object.keys(state.project.library.books).map((bookId) => [
      bookId,
      progressForBook(
        state.project.library.books[bookId],
        bookId,
        logged[bookId] ?? emptyLoggedProgress(),
      ),
    ]),
  );
}

export function selectBookProgress(
  state: AppState,
  bookId: string,
): BookProgressView {
  return (
    selectProgressByBook(state)[bookId] ??
    progressForBook(undefined, bookId, emptyLoggedProgress())
  );
}

function overallProgressFromMap(
  state: AppState,
  progressByBook: Record<string, BookProgressView>,
): OverallProgressView {
  const progress = Object.values(state.project.library.books)
    .filter((book) => !book.ignored)
    .map((book) => progressByBook[book.id])
    .filter((item): item is BookProgressView => Boolean(item));
  const totalPages = progress.reduce((sum, item) => sum + item.totalPages, 0);
  const readPages = progress.reduce((sum, item) => sum + item.readPages, 0);
  const remainingPages = Math.max(0, round1(totalPages - readPages));
  const percent = totalPages
    ? clampPercent(round1((readPages / totalPages) * 100))
    : 0;
  const completeBooks = progress.filter(
    (item) => item.status === 'complete',
  ).length;
  const inProgressBooks = progress.filter(
    (item) => item.status === 'in_progress',
  ).length;

  return {
    totalPages: round1(totalPages),
    readPages: round1(readPages),
    remainingPages,
    percent,
    totalBooks: progress.length,
    completeBooks,
    inProgressBooks,
    label: `${round1(readPages)} / ${round1(totalPages)} pages`,
    detail: `${completeBooks}/${progress.length} books complete · ${inProgressBooks} in progress`,
  };
}

export function selectProgressSummary(state: AppState): ProgressSummaryView {
  const byBook = selectProgressByBook(state);
  return {
    byBook,
    overall: overallProgressFromMap(state, byBook),
  };
}

export function selectOverallProgress(state: AppState): OverallProgressView {
  return selectProgressSummary(state).overall;
}
