import type {
  AppState,
  CalendarEntry,
  CalendarLearningMode,
} from '../../core/types';
import { minutesPerPage } from '../../core/constraints';
import { compareChain, compareNumberAsc, compareText } from '../../core/sort';
import { round1 } from '../../core/utils';
import {
  activityRows,
  activitySummaries,
  fixedActivityBlocksForDay,
  flexibleActivityBlocksForWeek,
  intervalFromActivity,
  type HourlyCalendarActivityBlock,
} from './calendar-activity-blocks';
import { buildHourlyCalendarIcs } from './calendar-ics';
import {
  calendarDateTime,
  clampStartMinute,
  durationForEntry,
  formatClockMinute,
  HOUR_END,
  HOUR_MINUTES,
  HOUR_START,
  nextAvailableStart,
  overlaps,
  type OccupiedInterval,
} from './calendar-time';
import { buildCalendarWeeks, type CalendarWeek } from './calendar-weeks';
import { formatPlanFullDate } from './date-labels';
import { memoizeSelector } from './memo';
import { selectPlanColors } from './plan-colors';

export { formatClockMinute };

export interface HourlyCalendarBlock {
  id: string;
  dateKey: string;
  bookId: string;
  short: string;
  title: string;
  color: string;
  startMinute: number;
  durationMinutes: number;
  endMinute: number;
  startLabel: string;
  endLabel: string;
  timeLabel: string;
  plannedMinutes: number;
  plannedPages: number;
  googleCalendarUrl: string;
  persisted: boolean;
  performanceTone: 'neutral' | 'ahead' | 'behind';
  performanceLabel: string;
  performanceRatio: number | null;
}

export interface HourlyCalendarUnscheduledBlock {
  id: string;
  dateKey: string;
  bookId: string;
  short: string;
  title: string;
  durationMinutes: number;
  reason: string;
}

export interface HourlyCalendarDay {
  key: string;
  label: string;
  statusLabel: string;
  blocks: HourlyCalendarBlock[];
  unscheduledBlocks: HourlyCalendarUnscheduledBlock[];
  activityBlocks: HourlyCalendarActivityBlock[];
}

export interface HourlyCalendarWeek {
  key: string;
  label: string;
  days: HourlyCalendarDay[];
}

export interface CalendarViewModel {
  weeks: HourlyCalendarWeek[];
  hourLabels: Array<{ minute: number; label: string }>;
  icsText: string;
  icsDataUrl: string;
  exportSummary: string;
  activitySummaries: string[];
  activityRows: Array<{
    id: string;
    title: string;
    color: string;
    summary: string;
  }>;
  learningMode: CalendarLearningMode;
  bookWindows: Array<{
    bookId: string;
    label: string;
    startWeekIndex: number;
    endWeekIndex: number;
  }>;
  selectedWeekIndex: number;
  weekCount: number;
  selectedWeekLabel: string;
  canGoPrevious: boolean;
  canGoNext: boolean;
}

function googleEventUrl(
  block: Omit<HourlyCalendarBlock, 'googleCalendarUrl'>,
): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Study: ${block.short}`,
    dates: `${calendarDateTime(block.dateKey, block.startMinute)}/${calendarDateTime(block.dateKey, block.endMinute)}`,
    details: `${block.title}\nPlanned ${Math.round(block.plannedMinutes)} minute(s), ${round1(block.plannedPages)} page(s).`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function performanceForEntry(input: {
  state: AppState;
  dateKey: string;
  entry: CalendarEntry;
  expectedMinutesPerPage: number;
}): Pick<
  HourlyCalendarBlock,
  'performanceTone' | 'performanceLabel' | 'performanceRatio'
> {
  const actual =
    input.state.project.manualOverrides.actuals[input.dateKey]?.[
      input.entry.bookId
    ];
  if (
    !actual ||
    actual.minutes == null ||
    actual.pages == null ||
    actual.minutes <= 0 ||
    actual.pages <= 0 ||
    input.expectedMinutesPerPage <= 0
  ) {
    return {
      performanceTone: 'neutral',
      performanceLabel: 'No actuals yet',
      performanceRatio: null,
    };
  }
  const observedMinutesPerPage = actual.minutes / actual.pages;
  const ratio = input.expectedMinutesPerPage / observedMinutesPerPage;
  if (ratio >= 1.15) {
    return {
      performanceTone: 'ahead',
      performanceLabel: `${Math.round((ratio - 1) * 100)}% ahead of expected pace`,
      performanceRatio: ratio,
    };
  }
  if (ratio <= 0.85) {
    return {
      performanceTone: 'behind',
      performanceLabel: `${Math.round((1 - ratio) * 100)}% slower than expected pace`,
      performanceRatio: ratio,
    };
  }
  return {
    performanceTone: 'neutral',
    performanceLabel: 'Near expected pace',
    performanceRatio: ratio,
  };
}

function blockForEntry(input: {
  state: AppState;
  dateKey: string;
  entry: CalendarEntry;
  color: string;
  startMinute: number;
  durationMinutes: number;
  persisted: boolean;
}): HourlyCalendarBlock {
  const startMinute = clampStartMinute(input.startMinute);
  const durationMinutes = Math.min(
    input.durationMinutes,
    24 * 60 - startMinute,
  );
  const plannedPages = input.entry.readPages + input.entry.skimPages;
  const expectedMinutesPerPage = minutesPerPage(
    input.state.snapshot.difficultyModel[input.entry.bookId]
      ?.scheduleDifficulty ?? 5,
    input.state.project.constraints,
  );
  const performance = performanceForEntry({
    state: input.state,
    dateKey: input.dateKey,
    entry: input.entry,
    expectedMinutesPerPage,
  });
  const base = {
    id: `${input.dateKey}:${input.entry.bookId}`,
    dateKey: input.dateKey,
    bookId: input.entry.bookId,
    short: input.entry.short,
    title:
      input.state.project.library.books[input.entry.bookId]?.title ??
      input.entry.short,
    color: input.color,
    startMinute,
    durationMinutes,
    endMinute: Math.min(24 * 60, startMinute + durationMinutes),
    startLabel: formatClockMinute(startMinute),
    endLabel: formatClockMinute(
      Math.min(24 * 60, startMinute + durationMinutes),
    ),
    timeLabel: '',
    plannedMinutes: input.entry.mins,
    plannedPages,
    persisted: input.persisted,
    ...performance,
  };
  const block = {
    ...base,
    timeLabel: `${base.startLabel}-${base.endLabel}`,
    googleCalendarUrl: '',
  };
  return { ...block, googleCalendarUrl: googleEventUrl(block) };
}

function bookWindows(
  sourceWeeks: CalendarWeek[],
  state: AppState,
): CalendarViewModel['bookWindows'] {
  const windows = new Map<
    string,
    {
      bookId: string;
      label: string;
      startWeekIndex: number;
      endWeekIndex: number;
    }
  >();
  sourceWeeks.forEach((week, weekIndex) => {
    week.days.forEach((day) => {
      day.entries.forEach((entry) => {
        const existing = windows.get(entry.bookId);
        const label =
          state.project.library.books[entry.bookId]?.short ?? entry.short;
        windows.set(entry.bookId, {
          bookId: entry.bookId,
          label,
          startWeekIndex: existing?.startWeekIndex ?? weekIndex,
          endWeekIndex: weekIndex,
        });
      });
    });
  });
  return [...windows.values()].sort((left, right) =>
    compareText(left.label, right.label),
  );
}

function dayBlocks(
  state: AppState,
  week: CalendarWeek,
  activityBlocksByDate: Map<string, HourlyCalendarActivityBlock[]>,
): HourlyCalendarWeek {
  const colors = selectPlanColors(state);
  return {
    key: week.key,
    label: week.label,
    days: week.days.map((day) => {
      const entries = day.sortedEntries
        .slice()
        .sort((left, right) =>
          compareChain(
            compareNumberAsc(left.lane, right.lane),
            compareText(left.short, right.short),
          ),
        );
      const occupied = (activityBlocksByDate.get(day.key) ?? []).map(
        intervalFromActivity,
      );
      const blocks: HourlyCalendarBlock[] = [];
      const unscheduledBlocks: HourlyCalendarUnscheduledBlock[] = [];
      entries.forEach((entry) => {
        const override =
          state.project.manualOverrides.timeBlocks?.[day.key]?.[entry.bookId];
        const durationMinutes = Math.min(
          override?.durationMinutes ?? durationForEntry(entry),
          24 * 60,
        );
        const overrideStart = override?.startMinute;
        const overrideFits =
          overrideStart != null &&
          !overlaps(overrideStart, durationMinutes, occupied);
        const startMinute =
          overrideFits && overrideStart != null
            ? overrideStart
            : nextAvailableStart(
                durationMinutes,
                occupied,
                state.ui.calendarLearningMode,
              );
        if (startMinute == null) {
          unscheduledBlocks.push({
            id: `${day.key}:${entry.bookId}:unscheduled`,
            dateKey: day.key,
            bookId: entry.bookId,
            short: entry.short,
            title:
              state.project.library.books[entry.bookId]?.title ?? entry.short,
            durationMinutes,
            reason:
              'No free same-day slot remains after fixed activities and study blocks.',
          });
          return;
        }
        occupied.push({
          startMinute,
          endMinute: Math.min(24 * 60, startMinute + durationMinutes),
        });
        blocks.push(
          blockForEntry({
            state,
            dateKey: day.key,
            entry,
            color: colors.byBookId[entry.bookId] || 'hsl(160 42% 55%)',
            startMinute,
            durationMinutes,
            persisted: Boolean(override),
          }),
        );
      });
      const statusLabel = unscheduledBlocks.length
        ? `${day.statusLabel} · ${unscheduledBlocks.length} unscheduled`
        : day.statusLabel;
      return {
        key: day.key,
        label: `${day.dayLabel} ${day.dayNumber}`,
        statusLabel,
        activityBlocks: activityBlocksByDate.get(day.key) ?? [],
        unscheduledBlocks,
        blocks,
      };
    }),
  };
}

function calendarExportSummary(input: {
  blockCount: number;
  unscheduledCount: number;
  weekLabel: string;
  finishDate?: Date;
}): string {
  if (!input.blockCount && !input.unscheduledCount) {
    return 'No study blocks to export yet.';
  }
  const unscheduled =
    input.unscheduledCount > 0
      ? ` · ${input.unscheduledCount} unscheduled`
      : '';
  return `${input.blockCount} study block(s) in ${input.weekLabel}${unscheduled} · plan finish ${formatPlanFullDate(input.finishDate)}`;
}

const selectCalendarViewModelMemo = memoizeSelector(
  'calendar.viewModel',
  (state: AppState) => [
    state.snapshot.dayPlan,
    state.project.manualOverrides.timeBlocks ?? {},
    state.project.manualOverrides.actuals,
    state.project.manualOverrides.calendarActivities ?? {},
    state.project.library.books,
    state.ui.calendarLearningMode,
    state.ui.planColorMode,
    state.ui.calendarWeekIndex,
  ],
  (state: AppState): CalendarViewModel => {
    const sourceWeeks = buildCalendarWeeks(state);
    const weekCount = sourceWeeks.length;
    const selectedWeekIndex = weekCount
      ? Math.min(Math.max(0, state.ui.calendarWeekIndex), weekCount - 1)
      : 0;
    const selectedWeek = sourceWeeks[selectedWeekIndex];
    const activities = Object.values(
      state.project.manualOverrides.calendarActivities ?? {},
    );
    const occupiedByDate = new Map<string, OccupiedInterval[]>();
    const activityBlocksByDate = new Map<
      string,
      HourlyCalendarActivityBlock[]
    >();
    if (selectedWeek) {
      selectedWeek.days.forEach((day) => {
        const fixed = fixedActivityBlocksForDay(
          activities,
          day.key,
          selectedWeekIndex,
        );
        activityBlocksByDate.set(day.key, fixed);
        occupiedByDate.set(day.key, fixed.map(intervalFromActivity));
      });
      flexibleActivityBlocksForWeek(
        activities,
        selectedWeek,
        occupiedByDate,
        state.ui.calendarLearningMode,
      ).forEach((block) => {
        activityBlocksByDate.set(block.dateKey, [
          ...(activityBlocksByDate.get(block.dateKey) ?? []),
          block,
        ]);
      });
    }
    const weeks = selectedWeek
      ? [dayBlocks(state, selectedWeek, activityBlocksByDate)]
      : [];
    const blocks = weeks.flatMap((week) =>
      week.days.flatMap((day) => day.blocks),
    );
    const unscheduledBlocks = weeks.flatMap((week) =>
      week.days.flatMap((day) => day.unscheduledBlocks),
    );
    const activityBlocks = weeks.flatMap((week) =>
      week.days.flatMap((day) => day.activityBlocks),
    );
    const icsText = buildHourlyCalendarIcs(blocks, activityBlocks);
    return {
      weeks,
      hourLabels: Array.from(
        { length: HOUR_END - HOUR_START + 1 },
        (_, index) => {
          const minute = (HOUR_START + index) * HOUR_MINUTES;
          return { minute, label: formatClockMinute(minute) };
        },
      ),
      icsText,
      icsDataUrl: `data:text/calendar;charset=utf-8,${encodeURIComponent(icsText)}`,
      exportSummary: calendarExportSummary({
        blockCount: blocks.length,
        unscheduledCount: unscheduledBlocks.length,
        weekLabel: selectedWeek?.label ?? 'selected week',
        finishDate: state.snapshot.scheduleStats.finishDate,
      }),
      activitySummaries: activitySummaries(activities),
      activityRows: activityRows(activities),
      learningMode: state.ui.calendarLearningMode,
      bookWindows: bookWindows(sourceWeeks, state),
      selectedWeekIndex,
      weekCount,
      selectedWeekLabel: selectedWeek?.label ?? 'No planned week',
      canGoPrevious: selectedWeekIndex > 0,
      canGoNext: selectedWeekIndex < weekCount - 1,
    };
  },
);

export function selectCalendarViewModel(state: AppState): CalendarViewModel {
  return selectCalendarViewModelMemo(state);
}
