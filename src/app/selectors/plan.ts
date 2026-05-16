import {
  localDateKey,
  parseLocalDateKey,
  plannerClock,
  studyWeekdays,
  studyDateFromSlot,
} from '../../core/time';
import {
  formatWholeNumber,
  formatWholePercent,
} from '../../core/number-format';
import { compareChain, compareNumberAsc, compareText } from '../../core/sort';
import type {
  AppState,
  CalendarEntry,
  ScheduleRow,
  WarningItem,
} from '../../core/types';
import { compactItems, compactJoin, round1 } from '../../core/utils';
import { buildCalendarWeeks, type CalendarWeek } from './calendar-weeks';
import { formatPlanFullDate, formatPlanShortDate } from './date-labels';
import { selectPlanColors, type PlanColorMetadata } from './plan-colors';
import { selectProgressSummary, type OverallProgressView } from './progress';
import { memoizeSelector } from './memo';
import {
  selectBookInspector,
  type BookInspectorViewModel,
} from './plan-inspector';
import { selectDismissedWarningCount, selectVisibleWarnings } from './warnings';

export interface StatCardView {
  label: string;
  value: string;
  hint: string;
}

export interface GanttViewModel {
  rows: ScheduleRow[];
  diagnostics: boolean;
  zoom: number;
  view: AppState['ui']['ganttView'];
  maxSlot: number;
  slotsPerWeek: number;
  boardMinWidth: number;
  weekCount: number;
}

export interface CurrentEpochBookView {
  id: string;
  short: string;
  displayGroup: string;
  minutes: number;
  pages: number;
  selected: boolean;
  done: boolean;
}

export interface CurrentEpochViewModel {
  title: string;
  startDateKey: string | null;
  endDateKey: string | null;
  label: string;
  modeLabel: string;
  capacity: number;
  epochIndex: number;
  epochCount: number;
  studyDayCount: number;
  books: CurrentEpochBookView[];
  hint: string;
}

export interface PlanViewModel {
  selectedBookId: string | null;
  selectedCalendarEntry: AppState['ui']['selectedCalendarEntry'];
  emptyDayPolicy: AppState['project']['constraints']['emptyDayPolicy'];
  stats: StatCardView[];
  currentEpoch: CurrentEpochViewModel;
  gantt: GanttViewModel;
  calendarWeeks: CalendarWeek[];
  colors: PlanColorMetadata;
  progress: OverallProgressView;
  warnings: WarningItem[];
  hiddenWarningCount: number;
  inspector: BookInspectorViewModel;
  planSections: AppState['ui']['planSections'];
  bookJumpOptions: Array<{ id: string; label: string }>;
  timelineLabel(slot: number): string;
}

export function selectTimelineLabel(state: AppState): (slot: number) => string {
  return (slot: number) =>
    formatPlanShortDate(
      studyDateFromSlot(
        state.project,
        slot,
        plannerClock.timelineStart(state.project),
      ),
    );
}

function selectPlanStats(
  state: AppState,
  progress: OverallProgressView,
): StatCardView[] {
  const stats = state.snapshot.scheduleStats;
  return [
    {
      label: 'Projected finish',
      value: formatPlanFullDate(stats.finishDate),
      hint: `${round1(stats.spanWeeks)} weeks`,
    },
    {
      label: 'Overall progress',
      value: formatWholePercent(progress.percent),
      hint: progress.label,
    },
    {
      label: 'Planned hours',
      value: formatWholeNumber(stats.totalHours),
      hint: `${formatWholeNumber(stats.remainingHours)} hours remaining`,
    },
    {
      label: 'Parallel occupancy',
      value: `${formatWholeNumber(stats.peakBooks)}/${state.project.constraints.par}`,
      hint: `${formatWholeNumber(stats.unfilledParallelSlots)} unfilled slots`,
    },
    {
      label: 'Relaxed floors',
      value: formatWholeNumber(stats.floorRelaxedBooks),
      hint: `${formatWholeNumber(stats.floorRelaxedDays)} affected days`,
    },
    {
      label: 'Backfilled starts',
      value: formatWholeNumber(stats.backfilledStarts),
      hint: `${formatWholeNumber(stats.prereqOverlapStarts)} overlap starts`,
    },
    {
      label: 'Hard blockers',
      value: formatWholeNumber(stats.hardInfeasibleBooks),
      hint: `${formatWholeNumber(stats.blockedBooks)} currently blocked`,
    },
  ];
}

function selectGantt(state: AppState): GanttViewModel {
  const rows = state.snapshot.renderModel.gantt.rows
    .slice()
    .sort((left, right) =>
      compareChain(
        compareNumberAsc(left.lane, right.lane),
        compareNumberAsc(left.targetStart, right.targetStart),
        compareText(left.short, right.short),
      ),
    );
  const maxSlot = Math.max(
    state.snapshot.renderModel.gantt.totalSlots,
    ...rows.map((row) => Math.max(row.targetEnd, row.actualEnd ?? 0)),
  );
  const zoom = state.ui.ganttZoom;
  const slotsPerWeek = Math.max(1, studyWeekdays(state.project).length);
  return {
    rows,
    diagnostics: state.ui.ganttView === 'diagnostics',
    zoom,
    view: state.ui.ganttView,
    maxSlot,
    slotsPerWeek,
    weekCount: Math.max(1, Math.ceil(maxSlot / slotsPerWeek)),
    boardMinWidth: Math.max(520, Math.round(maxSlot * 26 * zoom)),
  };
}

function entrySetKey(entries: CalendarEntry[]): string {
  return [...new Set(entries.map((entry) => entry.bookId))]
    .sort()
    .join('\u0000');
}

interface EpochAccumulator {
  startDateKey: string;
  endDateKey: string;
  setKey: string;
  dates: string[];
  entriesByBook: Map<string, CurrentEpochBookView>;
}

function createEpoch(
  dateKey: string,
  entries: CalendarEntry[],
  selectedBookId: string | null,
): EpochAccumulator {
  const epoch: EpochAccumulator = {
    startDateKey: dateKey,
    endDateKey: dateKey,
    setKey: entrySetKey(entries),
    dates: [dateKey],
    entriesByBook: new Map(),
  };
  mergeEpochEntries(epoch, entries, selectedBookId);
  return epoch;
}

function mergeEpochEntries(
  epoch: EpochAccumulator,
  entries: CalendarEntry[],
  selectedBookId: string | null,
): void {
  entries.forEach((entry) => {
    const existing = epoch.entriesByBook.get(entry.bookId);
    if (!existing) {
      epoch.entriesByBook.set(entry.bookId, {
        id: entry.bookId,
        short: entry.short,
        displayGroup: entry.displayGroup,
        minutes: entry.mins,
        pages: entry.readPages + entry.skimPages,
        selected: selectedBookId === entry.bookId,
        done: entry.done,
      });
      return;
    }
    existing.minutes += entry.mins;
    existing.pages += entry.readPages + entry.skimPages;
    existing.done = existing.done && entry.done;
  });
}

function planEpochs(state: AppState): EpochAccumulator[] {
  const dates = Object.keys(state.snapshot.dayPlan.byDate).sort();
  const epochs: EpochAccumulator[] = [];
  dates.forEach((dateKey) => {
    const entries = state.snapshot.dayPlan.byDate[dateKey] ?? [];
    if (!entries.length) return;
    const key = entrySetKey(entries);
    const current = epochs[epochs.length - 1];
    if (current && current.setKey === key) {
      current.endDateKey = dateKey;
      current.dates.push(dateKey);
      mergeEpochEntries(current, entries, state.ui.selectedBookId);
      return;
    }
    epochs.push(createEpoch(dateKey, entries, state.ui.selectedBookId));
  });
  return epochs;
}

function epochLabel(
  startDateKey: string | null,
  endDateKey: string | null,
): string {
  if (!startDateKey || !endDateKey) return 'No planned study window';
  const start = formatPlanFullDate(parseLocalDateKey(startDateKey));
  if (startDateKey === endDateKey) return start;
  return `${start} - ${formatPlanFullDate(parseLocalDateKey(endDateKey))}`;
}

function selectCurrentEpoch(state: AppState): CurrentEpochViewModel {
  const epochs = planEpochs(state);
  const todayKey = localDateKey();
  const selectedIndex = epochs.findIndex(
    (epoch) => epoch.startDateKey <= todayKey && epoch.endDateKey >= todayKey,
  );
  const nextIndex = epochs.findIndex((epoch) => epoch.startDateKey >= todayKey);
  const epochIndex =
    selectedIndex >= 0
      ? selectedIndex
      : nextIndex >= 0
        ? nextIndex
        : epochs.length - 1;
  const epoch = epochIndex >= 0 ? epochs[epochIndex] : null;
  const modeLabel =
    state.project.constraints.dailyBookMode === 'daily_cohort'
      ? 'Fixed N-book study stage'
      : 'Rotating eligible pool';
  const title =
    epoch && epoch.startDateKey <= todayKey && epoch.endDateKey >= todayKey
      ? 'Current epoch'
      : epoch && epoch.startDateKey > todayKey
        ? 'Next epoch'
        : 'Last planned epoch';
  const books = epoch
    ? [...epoch.entriesByBook.values()].sort((left, right) =>
        compareChain(
          compareText(left.short, right.short),
          compareText(left.id, right.id),
        ),
      )
    : [];
  return {
    title,
    startDateKey: epoch?.startDateKey ?? null,
    endDateKey: epoch?.endDateKey ?? null,
    label: epochLabel(epoch?.startDateKey ?? null, epoch?.endDateKey ?? null),
    modeLabel,
    capacity: state.project.constraints.par,
    epochIndex: epoch ? epochIndex + 1 : 0,
    epochCount: epochs.length,
    studyDayCount: epoch?.dates.length ?? 0,
    books,
    hint: epoch
      ? `Epoch ${epochIndex + 1}/${epochs.length}: ${books.length}/${state.project.constraints.par} active book slot(s), ${epoch.dates.length} study day(s).`
      : 'No active books are scheduled in the plan.',
  };
}

function selectPlanBookJumpOptions(state: AppState): Array<{
  id: string;
  label: string;
}> {
  return state.snapshot.renderModel.gantt.rows
    .map((row) => ({ id: row.id, label: row.short || row.id }))
    .sort((left, right) =>
      compareChain(
        compareText(left.label, right.label),
        compareText(left.id, right.id),
      ),
    );
}

const selectPlanViewModelMemo = memoizeSelector(
  'plan.viewModel',
  (state: AppState) => [
    state.project,
    state.snapshot,
    state.ui.selectedBookId,
    state.ui.selectedCalendarEntry,
    state.ui.ganttView,
    state.ui.ganttZoom,
    state.ui.planColorMode,
    state.ui.planSections,
    state.project.uiPreferences.dismissedWarningCodes,
  ],
  (state: AppState): PlanViewModel => {
    const progress = selectProgressSummary(state);
    return {
      selectedBookId: state.ui.selectedBookId,
      selectedCalendarEntry: state.ui.selectedCalendarEntry,
      emptyDayPolicy: state.project.constraints.emptyDayPolicy,
      stats: selectPlanStats(state, progress.overall),
      currentEpoch: selectCurrentEpoch(state),
      gantt: selectGantt(state),
      calendarWeeks: buildCalendarWeeks(state),
      colors: selectPlanColors(state),
      progress: progress.overall,
      warnings: selectVisibleWarnings(state),
      hiddenWarningCount: selectDismissedWarningCount(state),
      inspector: selectBookInspector(state, progress.byBook),
      planSections: state.ui.planSections,
      bookJumpOptions: selectPlanBookJumpOptions(state),
      timelineLabel: selectTimelineLabel(state),
    };
  },
);

export function selectPlanViewModel(state: AppState): PlanViewModel {
  return selectPlanViewModelMemo(state);
}

export function calendarBadges(
  entry: CalendarEntry,
): Array<{ label: string; tone?: 'neutral' | 'success' | 'warn' | 'danger' }> {
  return compactItems([
    { label: entry.track || `Lane ${entry.lane + 1}` },
    entry.done ? { label: 'Done', tone: 'success' as const } : null,
    entry.actualOverride ? { label: 'Actual', tone: 'success' as const } : null,
  ]);
}

export function calendarDetailText(entry: CalendarEntry): string {
  return compactJoin(
    [
      `${entry.short}: ${formatWholeNumber(entry.mins)} planned minute(s), ${round1(entry.readPages)} page(s)`,
      entry.skimPages ? `${round1(entry.skimPages)} skim page(s)` : null,
      entry.boosted ? 'Boost day: unused time was reassigned here' : null,
      entry.floorRelaxed
        ? `Floor relaxed ${round1(entry.effectiveMinPg)}/${round1(entry.strictMinPg)} pg`
        : null,
      entry.backfilled ? 'Backfilled into an otherwise empty slot' : null,
      entry.prereqOverlap ? 'Started using prerequisite-overlap policy' : null,
      entry.actualOverride
        ? `Actual override: ${formatWholeNumber(entry.actualMinutes ?? entry.mins)} minute(s), ${round1(entry.actualPages ?? entry.readPages + entry.skimPages)} page(s)`
        : null,
      entry.done ? 'Marked done' : null,
    ],
    ' · ',
  );
}
