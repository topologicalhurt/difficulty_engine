import type { AppState, CalendarEntry } from '../../core/types';
import { round1 } from '../../core/utils';

export type ProgressStatus = 'not_started' | 'in_progress' | 'complete' | 'ignored';

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

export function selectBookProgress(state: AppState, bookId: string): BookProgressView {
  const book = state.project.library.books[bookId];
  const totalPages = Math.max(0, book?.pages ?? 0);
  const entries = state.snapshot.dayPlan.byBook[bookId] ?? [];
  const loggedPages = entries.reduce((sum, entry) => sum + progressPagesForEntry(entry), 0);
  const loggedMinutes = entries.reduce((sum, entry) => sum + progressMinutesForEntry(entry), 0);
  const doneEntries = entries.filter((entry) => entry.done || entry.actualOverride).length;
  const readPages = book?.completed ? totalPages : Math.min(totalPages, round1(loggedPages));
  const remainingPages = Math.max(0, round1(totalPages - readPages));
  const percent = totalPages ? clampPercent(round1((readPages / totalPages) * 100)) : 0;
  const status = progressStatus(Boolean(book?.ignored), readPages, totalPages);
  const label = `${round1(readPages)} / ${round1(totalPages)} pages`;
  const detail =
    status === 'complete'
      ? 'Complete'
      : status === 'ignored'
        ? 'Ignored in the active plan'
        : doneEntries
          ? `${doneEntries} logged calendar entr${doneEntries === 1 ? 'y' : 'ies'}`
          : 'No logged progress yet';

  return {
    bookId,
    totalPages,
    readPages,
    remainingPages,
    percent,
    loggedMinutes: round1(loggedMinutes),
    doneEntries,
    status,
    label,
    detail,
  };
}

export function selectOverallProgress(state: AppState): OverallProgressView {
  const progress = Object.values(state.project.library.books)
    .filter((book) => !book.ignored)
    .map((book) => selectBookProgress(state, book.id));
  const totalPages = progress.reduce((sum, item) => sum + item.totalPages, 0);
  const readPages = progress.reduce((sum, item) => sum + item.readPages, 0);
  const remainingPages = Math.max(0, round1(totalPages - readPages));
  const percent = totalPages ? clampPercent(round1((readPages / totalPages) * 100)) : 0;
  const completeBooks = progress.filter((item) => item.status === 'complete').length;
  const inProgressBooks = progress.filter((item) => item.status === 'in_progress').length;

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
