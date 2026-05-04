import { studyDateFromSlot } from '../../core/time';
import type {
  AppState,
  CalendarEntry,
  DifficultyBreakdown,
  RelationEvidence,
  SchedulePlanItem,
  ScheduleRow,
  WarningItem,
} from '../../core/types';
import { round1 } from '../../core/utils';
import { buildCalendarWeeks, type CalendarWeek } from './plan-view-model';
import { selectPlanColors, type PlanColorMetadata } from './plan-colors';
import { selectBookProgress, selectOverallProgress, type BookProgressView, type OverallProgressView } from './progress';

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

function roundWhole(value: number): string {
  return String(Math.round(value || 0));
}

function formatPlanDate(date?: Date): string {
  return date
    ? date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';
}

export function selectTimelineLabel(state: AppState): (slot: number) => string {
  return (slot: number) =>
    studyDateFromSlot(
      state.project,
      slot,
      new Date(`${state.project.constraints.sd}T12:00:00Z`),
    ).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
    });
}

function selectPlanStats(state: AppState): StatCardView[] {
  const stats = state.snapshot.scheduleStats;
  const progress = selectOverallProgress(state);
  return [
    { label: 'Projected finish', value: formatPlanDate(stats.finishDate), hint: `${round1(stats.spanWeeks)} weeks` },
    { label: 'Overall progress', value: `${roundWhole(progress.percent)}%`, hint: progress.label },
    { label: 'Planned hours', value: roundWhole(stats.totalHours), hint: `${roundWhole(stats.remainingHours)} hours remaining` },
    {
      label: 'Parallel occupancy',
      value: `${roundWhole(stats.peakBooks)}/${state.project.constraints.par}`,
      hint: `${roundWhole(stats.unfilledParallelSlots)} unfilled slots`,
    },
    { label: 'Relaxed floors', value: roundWhole(stats.floorRelaxedBooks), hint: `${roundWhole(stats.floorRelaxedDays)} affected days` },
    { label: 'Backfilled starts', value: roundWhole(stats.backfilledStarts), hint: `${roundWhole(stats.prereqOverlapStarts)} overlap starts` },
    { label: 'Hard blockers', value: roundWhole(stats.hardInfeasibleBooks), hint: `${roundWhole(stats.blockedBooks)} currently blocked` },
  ];
}

function selectGantt(state: AppState): GanttViewModel {
  const rows = state.snapshot.renderModel.gantt.rows
    .slice()
    .sort((left, right) => left.lane - right.lane || left.targetStart - right.targetStart || left.short.localeCompare(right.short));
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

function selectInspector(state: AppState): BookInspectorViewModel {
  const fallbackId =
    state.ui.selectedBookId ||
    state.snapshot.renderModel.gantt.rows[0]?.id ||
    Object.keys(state.project.library.books)[0] ||
    null;
  const book = fallbackId ? state.project.library.books[fallbackId] : undefined;
  const difficulty = fallbackId ? state.snapshot.difficultyModel[fallbackId] : undefined;
  return {
    fallbackId,
    bookTitle: book?.title ?? '',
    displayGroup: book?.displayGroup || 'Ungrouped',
    pages: book?.pages ?? 0,
    schedule: fallbackId ? state.snapshot.schedulePlan.byId[fallbackId] ?? null : null,
    dayStats: fallbackId ? state.snapshot.dayPlan.byBookStats[fallbackId] ?? null : null,
    difficulty: difficulty ?? null,
    progress: fallbackId ? selectBookProgress(state, fallbackId) : null,
    incoming: fallbackId ? state.snapshot.relations.filter((relation) => relation.to === fallbackId) : [],
    outgoing: fallbackId ? state.snapshot.relations.filter((relation) => relation.from === fallbackId) : [],
    explanation: difficulty?.explanation.slice(0, 4) ?? [],
  };
}

export function selectPlanViewModel(state: AppState): PlanViewModel {
  return {
    selectedBookId: state.ui.selectedBookId,
    selectedCalendarEntry: state.ui.selectedCalendarEntry,
    emptyDayPolicy: state.project.constraints.emptyDayPolicy,
    stats: selectPlanStats(state),
    gantt: selectGantt(state),
    calendarWeeks: buildCalendarWeeks(state),
    colors: selectPlanColors(state),
    progress: selectOverallProgress(state),
    warnings: state.snapshot.renderModel.warnings,
    inspector: selectInspector(state),
    timelineLabel: selectTimelineLabel(state),
  };
}

export function calendarBadges(entry: CalendarEntry): Array<{ label: string; tone?: 'neutral' | 'success' | 'warn' | 'danger' }> {
  return [
    { label: entry.track || `Lane ${entry.lane + 1}` },
    entry.done ? { label: 'Done', tone: 'success' as const } : null,
    entry.actualOverride ? { label: 'Actual', tone: 'success' as const } : null,
  ].filter(Boolean) as Array<{ label: string; tone?: 'neutral' | 'success' | 'warn' | 'danger' }>;
}

export function calendarDetailText(entry: CalendarEntry): string {
  return [
    `${entry.short}: ${roundWhole(entry.mins)} planned minute(s), ${round1(entry.readPages)} page(s)`,
    entry.skimPages ? `${round1(entry.skimPages)} skim page(s)` : null,
    entry.boosted ? 'Boost day: unused time was reassigned here' : null,
    entry.floorRelaxed ? `Floor relaxed ${round1(entry.effectiveMinPg)}/${round1(entry.strictMinPg)} pg` : null,
    entry.backfilled ? 'Backfilled into an otherwise empty slot' : null,
    entry.prereqOverlap ? 'Started using prerequisite-overlap policy' : null,
    entry.actualOverride
      ? `Actual override: ${roundWhole(entry.actualMinutes ?? entry.mins)} minute(s), ${round1(entry.actualPages ?? entry.readPages + entry.skimPages)} page(s)`
      : null,
    entry.done ? 'Marked done' : null,
  ].filter(Boolean).join(' · ');
}
