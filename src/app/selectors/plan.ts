import { plannerClock, studyDateFromSlot } from '../../core/time';
import {
  formatWholeNumber,
  formatWholePercent,
} from '../../core/number-format';
import { compareChain, compareNumberAsc, compareText } from '../../core/sort';
import type {
  AppState,
  CalendarEntry,
  DifficultyBreakdown,
  RelationEvidence,
  SchedulePlanItem,
  ScheduleRow,
  WarningItem,
} from '../../core/types';
import { compactJoin, round1 } from '../../core/utils';
import { buildCalendarWeeks, type CalendarWeek } from './calendar-weeks';
import { formatPlanFullDate, formatPlanShortDate } from './date-labels';
import { selectPlanColors, type PlanColorMetadata } from './plan-colors';
import {
  selectProgressSummary,
  type BookProgressView,
  type OverallProgressView,
} from './progress';

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

export interface BookInspectorViewModel {
  fallbackId: string | null;
  bookTitle: string;
  displayGroup: string;
  pages: number;
  schedule: SchedulePlanItem | null;
  dayStats: AppState['snapshot']['dayPlan']['byBookStats'][string] | null;
  difficulty: DifficultyBreakdown | null;
  progress: BookProgressView | null;
  incoming: RelationEvidence[];
  outgoing: RelationEvidence[];
  explanation: string[];
}

export interface PlanViewModel {
  selectedBookId: string | null;
  selectedCalendarEntry: AppState['ui']['selectedCalendarEntry'];
  emptyDayPolicy: AppState['project']['constraints']['emptyDayPolicy'];
  stats: StatCardView[];
  gantt: GanttViewModel;
  calendarWeeks: CalendarWeek[];
  colors: PlanColorMetadata;
  progress: OverallProgressView;
  warnings: WarningItem[];
  inspector: BookInspectorViewModel;
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

function selectInspector(
  state: AppState,
  progressByBook: Record<string, BookProgressView>,
): BookInspectorViewModel {
  const fallbackId =
    state.ui.selectedBookId ||
    state.snapshot.renderModel.gantt.rows[0]?.id ||
    Object.keys(state.project.library.books)[0] ||
    null;
  const book = fallbackId ? state.project.library.books[fallbackId] : undefined;
  const difficulty = fallbackId
    ? state.snapshot.difficultyModel[fallbackId]
    : undefined;
  return {
    fallbackId,
    bookTitle: book?.title ?? '',
    displayGroup: book?.displayGroup || 'Ungrouped',
    pages: book?.pages ?? 0,
    schedule: fallbackId
      ? (state.snapshot.schedulePlan.byId[fallbackId] ?? null)
      : null,
    dayStats: fallbackId
      ? (state.snapshot.dayPlan.byBookStats[fallbackId] ?? null)
      : null,
    difficulty: difficulty ?? null,
    progress: fallbackId ? (progressByBook[fallbackId] ?? null) : null,
    incoming: fallbackId
      ? state.snapshot.relations.filter(
          (relation) => relation.to === fallbackId,
        )
      : [],
    outgoing: fallbackId
      ? state.snapshot.relations.filter(
          (relation) => relation.from === fallbackId,
        )
      : [],
    explanation: difficulty?.explanation.slice(0, 4) ?? [],
  };
}

export function selectPlanViewModel(state: AppState): PlanViewModel {
  const progress = selectProgressSummary(state);
  return {
    selectedBookId: state.ui.selectedBookId,
    selectedCalendarEntry: state.ui.selectedCalendarEntry,
    emptyDayPolicy: state.project.constraints.emptyDayPolicy,
    stats: selectPlanStats(state, progress.overall),
    gantt: selectGantt(state),
    calendarWeeks: buildCalendarWeeks(state),
    colors: selectPlanColors(state),
    progress: progress.overall,
    warnings: state.snapshot.renderModel.warnings,
    inspector: selectInspector(state, progress.byBook),
    timelineLabel: selectTimelineLabel(state),
  };
}

export function calendarBadges(
  entry: CalendarEntry,
): Array<{ label: string; tone?: 'neutral' | 'success' | 'warn' | 'danger' }> {
  return [
    { label: entry.track || `Lane ${entry.lane + 1}` },
    entry.done ? { label: 'Done', tone: 'success' as const } : null,
    entry.actualOverride ? { label: 'Actual', tone: 'success' as const } : null,
  ].filter(Boolean) as Array<{
    label: string;
    tone?: 'neutral' | 'success' | 'warn' | 'danger';
  }>;
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
