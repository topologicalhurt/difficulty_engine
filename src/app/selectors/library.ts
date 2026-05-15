import type { AppState, BookRecord, EnrichmentStatus } from '../../core/types';
import { effectiveReadingPagesForBook } from '../../core/effective-pages';
import { readingScopeSettingsForProject } from '../../core/reading-scope';
import { classifyReadingSections } from '../../core/section-classifier';
import { qbittorrentRuntimeEnabled } from '../../core/source-settings-policy';
import { compareChain, compareNumberAsc, compareText } from '../../core/sort';
import { compactItems, round1 } from '../../core/utils';
import {
  emptyRelationSelectors,
  selectBookRelationSelectorSummary,
  type RelationSelectorView,
} from './library-relations';
import { memoizeSelector } from './memo';
import { selectProgressByBook, type BookProgressView } from './progress';

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
  readingScope: BookReadingScopeView | null;
  enrichmentStatus: EnrichmentStatus | 'idle';
  enrichmentError: string | null;
  enrichmentBridgePreflightRequired: boolean;
  bridgeUnavailableExplanation: string | null;
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

export interface BookReadingScopeView {
  effectivePages: number;
  physicalPages: number;
  skippedPages: number;
  bindingReason: string | null;
  sections: Array<{
    title: string;
    kind: string;
    skipped: boolean;
    pageRange: string | null;
    estimatedPages: number | null;
  }>;
}

export interface LibraryViewModel {
  selectedBook: BookRecord | undefined;
  readingList: ReadingListItemView[];
  editor: BookEditorViewModel;
  orderPolicy: string;
  listWidthPx: number;
  enrichmentProgress: {
    total: number;
    loading: number;
    ready: number;
    failed: number;
    idle: number;
  };
  enrichmentBridgePreflightRequired: boolean;
  bridgeUnavailableExplanation: string | null;
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

function documentBadgeViews(book: BookRecord): BadgeView[] {
  const documents = book.documents ?? [];
  const hasQbittorrentPdf = documents.some(
    (document) =>
      document.provider === 'qbittorrent' &&
      document.contentKind === 'pdf' &&
      document.status === 'complete',
  );
  const hasReadableText = documents.some(
    (document) =>
      (document.contentKind === 'text' ||
        document.contentKind === 'ocr_text') &&
      document.status === 'complete',
  );
  const hasDocumentToc =
    book.enrichment.tocSource === 'pdf' &&
    book.enrichment.chapters.length >= 3;
  const hasOcrToc =
    hasDocumentToc &&
    documents.some(
      (document) =>
        document.contentKind === 'ocr_text' && document.status === 'complete',
    );
  return compactItems([
    hasQbittorrentPdf ? { label: 'pdf sourced', tone: 'success' } : null,
    hasReadableText ? { label: 'text sourced', tone: 'success' } : null,
    hasDocumentToc ? { label: 'toc sourced', tone: 'success' } : null,
    hasOcrToc ? { label: 'ocr toc', tone: 'success' } : null,
  ]);
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
      return compareChain(
        compareNumberAsc(leftDone, rightDone),
        compareNumberAsc(
          left.owned === false ? 1 : 0,
          right.owned === false ? 1 : 0,
        ),
        compareNumberAsc(left.planOrder, right.planOrder),
        compareText(left.title, right.title),
        compareText(left.id, right.id),
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
      ...documentBadgeViews(book),
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
      badges: compactItems(badges),
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

const selectLibraryViewModelMemo = memoizeSelector(
  'library.viewModel',
  (state: AppState) => [
    state.project,
    state.snapshot,
    state.ui.selectedBookId,
    state.ui.libraryListWidthPx,
    state.ui.qbittorrentConnection,
    state.ui.qbittorrentStatus,
    state.enrichment.byBookId,
  ],
  (state: AppState): LibraryViewModel => {
    const progressByBook = selectProgressByBook(state);
    const selectedBook = state.ui.selectedBookId
      ? state.project.library.books[state.ui.selectedBookId]
      : undefined;
    const enrichmentEntries = Object.values(state.enrichment.byBookId);
    const total = Object.keys(state.project.library.books).length;
    const loading = enrichmentEntries.filter(
      (entry) => entry.status === 'loading',
    ).length;
    const ready = enrichmentEntries.filter(
      (entry) => entry.status === 'success' || entry.status === 'stale',
    ).length;
    const failed = enrichmentEntries.filter(
      (entry) => entry.status === 'failed',
    ).length;
    const enrichmentBridgePreflightRequired = qbittorrentRuntimeEnabled(
      state.project.sourceSettings,
      state.ui.qbittorrentConnection,
    );
    const bridgeUnavailableExplanation =
      enrichmentBridgePreflightRequired &&
      state.ui.qbittorrentStatus.state === 'failed'
        ? state.ui.qbittorrentStatus.message
        : null;
    return {
      selectedBook,
      readingList: readingListViewModelFromProgress(state, progressByBook),
      editor: bookEditorViewModelFromProgress(
        state,
        selectedBook?.id ?? null,
        progressByBook,
      ),
      orderPolicy: state.project.constraints.bookOrderPolicy,
      listWidthPx: state.ui.libraryListWidthPx,
      enrichmentBridgePreflightRequired,
      bridgeUnavailableExplanation,
      enrichmentProgress: {
        total,
        loading,
        ready,
        failed,
        idle: Math.max(0, total - loading - ready - failed),
      },
    };
  },
);

export function selectLibraryViewModel(state: AppState): LibraryViewModel {
  return selectLibraryViewModelMemo(state);
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
      readingScope: null,
      enrichmentStatus: 'idle',
      enrichmentError: null,
      enrichmentBridgePreflightRequired: qbittorrentRuntimeEnabled(
        state.project.sourceSettings,
        state.ui.qbittorrentConnection,
      ),
      bridgeUnavailableExplanation:
        state.ui.qbittorrentStatus.state === 'failed'
          ? state.ui.qbittorrentStatus.message
          : null,
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
  const readingScopeSettings = readingScopeSettingsForProject(state.project);
  const effectivePages = effectiveReadingPagesForBook(book, readingScopeSettings);
  const skippedByIndex = new Map(
    effectivePages.skippedSections.map((section) => [section.index, section]),
  );
  const readingScope: BookReadingScopeView = {
    effectivePages: effectivePages.effectivePages,
    physicalPages: effectivePages.physicalPages,
    skippedPages: effectivePages.skippedPages,
    bindingReason: effectivePages.bindingReason,
    sections: classifyReadingSections(book, readingScopeSettings).map(
      (section) => {
        const analyzed = skippedByIndex.get(section.index) ?? section;
        return {
          title: analyzed.title,
          kind: analyzed.kind,
          skipped: analyzed.skipped,
          pageRange: analyzed.pageRange
            ? `${analyzed.pageRange.start}-${analyzed.pageRange.end ?? '?'}`
            : null,
          estimatedPages: analyzed.estimatedPages ?? null,
        };
      },
    ),
  };

  return {
    book,
    allBooks,
    readingScope,
    enrichmentStatus: enrichmentEntry?.status ?? 'idle',
    enrichmentError: enrichmentEntry?.error ?? null,
    enrichmentBridgePreflightRequired: qbittorrentRuntimeEnabled(
      state.project.sourceSettings,
      state.ui.qbittorrentConnection,
    ),
    bridgeUnavailableExplanation:
      state.ui.qbittorrentStatus.state === 'failed'
        ? state.ui.qbittorrentStatus.message
        : null,
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
    planningBadges: compactItems([
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
    ]),
    relationSelectors: relationSummary.relationSelectors,
  };
}
