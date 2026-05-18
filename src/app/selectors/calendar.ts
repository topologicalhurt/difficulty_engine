import type { AppState, CalendarEntry } from '../../core/types';
import { compareChain, compareNumberAsc, compareText } from '../../core/sort';
import {
  addLocalDays,
  dateKeyFromDate,
  parseLocalDateKey,
} from '../../core/time';
import { round1 } from '../../core/utils';
import { buildCalendarWeeks, type CalendarWeek } from './calendar-weeks';
import { formatPlanFullDate } from './date-labels';
import { memoizeSelector } from './memo';
import { selectPlanColors } from './plan-colors';

const DEFAULT_DAY_START_MINUTE = 9 * 60;
const HOUR_START = 0;
const HOUR_END = 23;
const HOUR_MINUTES = 60;

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
}

export interface HourlyCalendarDay {
  key: string;
  label: string;
  statusLabel: string;
  blocks: HourlyCalendarBlock[];
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
}

function clampStartMinute(value: number): number {
  return Math.max(0, Math.min(23 * HOUR_MINUTES, Math.round(value / 60) * 60));
}

function durationForEntry(entry: CalendarEntry): number {
  return Math.max(30, Math.min(12 * 60, Math.round(entry.mins || 30)));
}

export function formatClockMinute(minute: number): string {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function calendarDateTime(dateKey: string, minute: number): string {
  const dayOffset = Math.floor(minute / (24 * 60));
  const localMinute = minute % (24 * 60);
  const resolvedDate = dayOffset
    ? dateKeyFromDate(addLocalDays(parseLocalDateKey(dateKey), dayOffset))
    : dateKey;
  const compactDate = resolvedDate.replaceAll('-', '');
  const hours = String(Math.floor(localMinute / 60)).padStart(2, '0');
  const minutes = String(localMinute % 60).padStart(2, '0');
  return `${compactDate}T${hours}${minutes}00`;
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

function blockForEntry(input: {
  state: AppState;
  dateKey: string;
  entry: CalendarEntry;
  index: number;
  color: string;
}): HourlyCalendarBlock {
  const override =
    input.state.project.manualOverrides.timeBlocks?.[input.dateKey]?.[
      input.entry.bookId
    ];
  const defaultStart = DEFAULT_DAY_START_MINUTE + input.index * HOUR_MINUTES;
  const startMinute = clampStartMinute(override?.startMinute ?? defaultStart);
  const durationMinutes = Math.min(
    override?.durationMinutes ?? durationForEntry(input.entry),
    24 * 60 - startMinute,
  );
  const plannedPages = input.entry.readPages + input.entry.skimPages;
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
    persisted: Boolean(override),
  };
  const block = {
    ...base,
    timeLabel: `${base.startLabel}-${base.endLabel}`,
    googleCalendarUrl: '',
  };
  return { ...block, googleCalendarUrl: googleEventUrl(block) };
}

function dayBlocks(state: AppState, week: CalendarWeek): HourlyCalendarWeek {
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
      return {
        key: day.key,
        label: `${day.dayLabel} ${day.dayNumber}`,
        statusLabel: day.statusLabel,
        blocks: entries.map((entry, index) =>
          blockForEntry({
            state,
            dateKey: day.key,
            entry,
            index,
            color: colors.byBookId[entry.bookId] || 'hsl(160 42% 55%)',
          }),
        ),
      };
    }),
  };
}

function escapeIcsText(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replaceAll('\n', '\\n');
}

function icsDate(dateKey: string, minute: number): string {
  return calendarDateTime(dateKey, minute).replace(/[-:]/g, '');
}

function buildIcs(blocks: HourlyCalendarBlock[]): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Difficulty Engine//Hourly Study Calendar//EN',
    'CALSCALE:GREGORIAN',
  ];
  blocks.forEach((block) => {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${escapeIcsText(block.id)}@difficulty-engine`,
      `SUMMARY:${escapeIcsText(`Study: ${block.short}`)}`,
      `DESCRIPTION:${escapeIcsText(`${block.title}\n${block.plannedMinutes} minute(s), ${round1(block.plannedPages)} page(s).`)}`,
      `DTSTART:${icsDate(block.dateKey, block.startMinute)}`,
      `DTEND:${icsDate(block.dateKey, block.endMinute)}`,
      'END:VEVENT',
    );
  });
  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

const selectCalendarViewModelMemo = memoizeSelector(
  'calendar.viewModel',
  (state: AppState) => [
    state.snapshot.dayPlan,
    state.project.manualOverrides.timeBlocks ?? {},
    state.project.library.books,
    state.ui.planColorMode,
  ],
  (state: AppState): CalendarViewModel => {
    const weeks = buildCalendarWeeks(state).map((week) =>
      dayBlocks(state, week),
    );
    const blocks = weeks.flatMap((week) =>
      week.days.flatMap((day) => day.blocks),
    );
    const icsText = buildIcs(blocks);
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
      exportSummary: blocks.length
        ? `${blocks.length} study block(s), first finish ${formatPlanFullDate(state.snapshot.scheduleStats.finishDate)}`
        : 'No study blocks to export yet.',
    };
  },
);

export function selectCalendarViewModel(state: AppState): CalendarViewModel {
  return selectCalendarViewModelMemo(state);
}
