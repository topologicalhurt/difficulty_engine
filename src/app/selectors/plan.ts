import {
  localDateKey,
  parseLocalDateKey,
  plannerClock,
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
import {
  selectProgressSummary,
  type OverallProgressView,
} from './progress';
import { memoizeSelector } from './memo';
import {
  selectBookInspector,
  type BookInspectorViewModel,
} from './plan-inspector';
import {
  selectDismissedWarningCount,
  selectVisibleWarnings,
} from './warnings';

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
  dateKey: string | null;
  label: string;
  modeLabel: string;
  capacity: number;
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
  return {
    rows,
    diagnostics: state.ui.ganttView === 'diagnostics',
    zoom,
    view: state.ui.ganttView,
    maxSlot,
    weekCount: Math.max(1, Math.ceil(maxSlot / 7)),
    boardMinWidth: Math.max(520, Math.round(maxSlot * 26 * zoom)),
  };
}

function selectCurrentEpoch(state: AppState): CurrentEpochViewModel {
  const dates = Object.keys(state.snapshot.dayPlan.byDate).sort();
  const todayKey = localDateKey();
  const dateKey =
    dates.find((candidate) => candidate >= todayKey) ??
    (dates.length ? dates[dates.length - 1] : null);
  const entries = dateKey ? (state.snapshot.dayPlan.byDate[dateKey] ?? []) : [];
  const modeLabel =
    state.project.constraints.dailyBookMode === 'daily_cohort'
      ? 'Fixed N-book learning epoch'
      : 'Rotating eligible pool';
  const title =
    dateKey === todayKey
      ? 'Current epoch'
      : dateKey && dateKey > todayKey
        ? 'Next study epoch'
        : 'Last planned epoch';
  return {
    title,
    dateKey,
    label: dateKey
      ? formatPlanFullDate(parseLocalDateKey(dateKey))
      : 'No planned study date',
    modeLabel,
    capacity: state.project.constraints.par,
    books: entries.map((entry) => ({
      id: entry.bookId,
      short: entry.short,
      displayGroup: entry.displayGroup,
      minutes: entry.mins,
      pages: entry.readPages + entry.skimPages,
      selected: state.ui.selectedBookId === entry.bookId,
      done: entry.done,
    })),
    hint: entries.length
      ? `${entries.length}/${state.project.constraints.par} active book slot(s) for this epoch.`
      : 'No active books are scheduled for this date.',
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
