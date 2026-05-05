import type { AppState, BookRecord, EnrichmentStatus } from '../../core/types';
import { round1 } from '../../core/utils';
import {
  emptyRelationSelectors,
  selectBookRelationSelectorSummary,
  type RelationSelectorView,
} from './library-relations';
import {
  selectProgressByBook,
  type BookProgressView,
} from './progress';

export interface BadgeView {
  label: string;
  tone?: 'neutral' | 'success' | 'warn' | 'danger';
}

export interface ReadingListItemView {
  id: string;
  title: string;
  short: string;
  selected: boolean;
  owned: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  badges: BadgeView[];
  meta: string;
  detail: string;
  progress: BookProgressView;
}

export interface BookEditorViewModel {
  book: BookRecord | undefined;
  allBooks: BookRecord[];
  enrichmentStatus: EnrichmentStatus | 'idle';
  enrichmentError: string | null;
  incomingRelations: string[];
  outgoingRelations: string[];
  scheduleSummary: string;
  difficultySummary: string;
  dayPlanSummary: string;
  progress: BookProgressView | null;
  planningBadges: BadgeView[];
  relationSelectors: {
    prereqs: RelationSelectorView;
    dependents: RelationSelectorView;
    coStudy: RelationSelectorView;
  };
}

export interface LibraryViewModel {
  selectedBook: BookRecord | undefined;
  readingList: ReadingListItemView[];
  editor: BookEditorViewModel;
  orderPolicy: string;
}

export function enrichmentBadgeView(
  state: AppState,
  bookId: string,
): BadgeView | null {
  const entry = state.enrichment.byBookId[bookId];
  if (!entry || entry.status === 'idle') return null;
  if (entry.status === 'success') return { label: 'enriched', tone: 'success' };
  if (entry.status === 'loading') return { label: 'loading' };
  if (entry.status === 'stale') return { label: 'stale', tone: 'warn' };
  return { label: 'failed', tone: 'danger' };
}

export function selectReadingListViewModel(
  state: AppState,
): ReadingListItemView[] {
  const progressByBook = selectProgressByBook(state);
  return readingListViewModelFromProgress(state, progressByBook);
}

function readingListViewModelFromProgress(
  state: AppState,
  progressByBook: Record<string, BookProgressView>,
): ReadingListItemView[] {
  const ordered = Object.values(state.project.library.books).sort(
    (left, right) => {
      const leftDone = left.completed ? 1 : 0;
      const rightDone = right.completed ? 1 : 0;
      return (
        leftDone - rightDone ||
        (left.owned === false ? 1 : 0) - (right.owned === false ? 1 : 0) ||
        left.planOrder - right.planOrder ||
        left.title.localeCompare(right.title)
      );
    },
  );
  return ordered.map((book, index) => {
    const schedule = state.snapshot.schedulePlan.byId[book.id];
    const dayStats = state.snapshot.dayPlan.byBookStats[book.id];
    const difficulty = state.snapshot.difficultyModel[book.id];
    const enrichment = enrichmentBadgeView(state, book.id);
    const progress = progressByBook[book.id];
    const badges: Array<BadgeView | null> = [
      book.completed ? { label: 'done', tone: 'success' } : null,
      book.owned === false ? { label: 'not owned', tone: 'warn' } : null,
      book.allowPrereqOverlap ? { label: 'overlap', tone: 'warn' } : null,
      book.ignored ? { label: 'ignored', tone: 'danger' } : null,
      schedule?.floorRelaxed ? { label: 'relaxed floor', tone: 'warn' } : null,
      dayStats?.backfilled ? { label: 'backfilled', tone: 'success' } : null,
      enrichment,
    ];
    return {
      id: book.id,
      title: book.title,
      short: book.short || book.title,
      selected: state.ui.selectedBookId === book.id,
      owned: book.owned !== false,
      canMoveUp: index > 0 && ordered[index - 1]?.owned === book.owned,
      canMoveDown:
        index < ordered.length - 1 && ordered[index + 1]?.owned === book.owned,
      badges: badges.filter(Boolean) as BadgeView[],
      meta: schedule
        ? `Order ${book.planOrder + 1} · Start ${schedule.ds + 1} · lane ${schedule.lane + 1} · ${book.pages} pages · seed ${round1(difficulty?.seed ?? book.manualSeedDifficulty)}`
        : `Order ${book.planOrder + 1} · ${book.pages} pages · seed ${round1(difficulty?.seed ?? book.manualSeedDifficulty)}`,
      detail:
        dayStats?.blockedReason ||
        dayStats?.infeasibleReason ||
        book.displayGroup,
      progress,
    };
  });
}

export function selectLibraryViewModel(state: AppState): LibraryViewModel {
  const progressByBook = selectProgressByBook(state);
  const selectedBook = state.ui.selectedBookId
    ? state.project.library.books[state.ui.selectedBookId]
    : undefined;
  return {
    selectedBook,
    readingList: readingListViewModelFromProgress(state, progressByBook),
    editor: bookEditorViewModelFromProgress(
      state,
      selectedBook?.id ?? null,
      progressByBook,
    ),
    orderPolicy: state.project.constraints.bookOrderPolicy,
  };
}

export function selectBookEditorViewModel(
  state: AppState,
  bookId: string | null,
): BookEditorViewModel {
  return bookEditorViewModelFromProgress(
    state,
    bookId,
    selectProgressByBook(state),
  );
}

function bookEditorViewModelFromProgress(
  state: AppState,
  bookId: string | null,
  progressByBook: Record<string, BookProgressView>,
): BookEditorViewModel {
  const book = bookId ? state.project.library.books[bookId] : undefined;
  const allBooks = Object.values(state.project.library.books);
  if (!book) {
    return {
      book,
      allBooks,
      enrichmentStatus: 'idle',
      enrichmentError: null,
      incomingRelations: [],
      outgoingRelations: [],
      scheduleSummary: 'Not scheduled yet.',
      difficultySummary: 'No difficulty model yet.',
      dayPlanSummary: 'No day-plan allocation yet.',
      progress: null,
      planningBadges: [],
      relationSelectors: emptyRelationSelectors(),
    };
  }

  const schedule = state.snapshot.schedulePlan.byId[book.id];
  const dayStats = state.snapshot.dayPlan.byBookStats[book.id];
  const difficulty = state.snapshot.difficultyModel[book.id];
  const enrichmentEntry = state.enrichment.byBookId[book.id];
  const progress = progressByBook[book.id];
  const relationSummary = selectBookRelationSelectorSummary(
    state,
    book,
    allBooks,
  );

  return {
    book,
    allBooks,
    enrichmentStatus: enrichmentEntry?.status ?? 'idle',
    enrichmentError: enrichmentEntry?.error ?? null,
    incomingRelations: relationSummary.incomingRelations,
    outgoingRelations: relationSummary.outgoingRelations,
    scheduleSummary: schedule
      ? `Lane ${schedule.lane + 1} · release slot ${schedule.releaseSlot} · ${schedule.plannedDays} planned study days`
      : 'Not scheduled yet.',
    difficultySummary: difficulty
      ? `Display difficulty ${round1(difficulty.displayDifficulty)} · schedule difficulty ${round1(difficulty.scheduleDifficulty)}`
      : 'No difficulty model yet.',
    dayPlanSummary: dayStats
      ? `Actual ${dayStats.usedDays} study day(s) · ${round1(dayStats.unfinishedPages)} unfinished pages`
      : 'No day-plan allocation yet.',
    progress,
    planningBadges: [
      schedule?.floorRelaxed
        ? {
            label: `floor ${round1(schedule.effectiveMinPg)}/${round1(schedule.strictMinPg)}`,
            tone: 'warn',
          }
        : null,
      dayStats?.backfilled ? { label: 'backfilled', tone: 'success' } : null,
      dayStats?.prereqOverlapUsed
        ? { label: 'prereq overlap', tone: 'warn' }
        : null,
    ].filter(Boolean) as BadgeView[],
    relationSelectors: relationSummary.relationSelectors,
  };
}
