import {
  formatClockMinute,
  selectCalendarViewModel,
  type HourlyCalendarBlock,
  type HourlyCalendarDay,
} from '../app/selectors/calendar';
import type { AppState, PlannerStore } from '../core/types';
import { button, el, emptyState, panel } from './dom';
import { renderCalendarSurface } from './calendar-surface';

const DRAG_MIME = 'application/x-difficulty-calendar-block';

function dragPayload(block: HourlyCalendarBlock): string {
  return JSON.stringify({
    dateKey: block.dateKey,
    bookId: block.bookId,
    durationMinutes: block.durationMinutes,
  });
}

function readDragPayload(event: DragEvent): {
  bookId: string;
  durationMinutes: number;
} | null {
  const raw = event.dataTransfer?.getData(DRAG_MIME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      bookId?: unknown;
      durationMinutes?: unknown;
    };
    return typeof parsed.bookId === 'string'
      ? {
          bookId: parsed.bookId,
          durationMinutes:
            typeof parsed.durationMinutes === 'number'
              ? parsed.durationMinutes
              : 60,
        }
      : null;
  } catch {
    return null;
  }
}

function renderBlock(
  block: HourlyCalendarBlock,
  store: PlannerStore,
): HTMLElement {
  return el(
    'article',
    {
      className: `hourly-calendar-block${block.persisted ? ' persisted' : ''}`,
      draggable: true,
      title: `${block.title} · ${block.timeLabel}`,
      dataset: {
        calendarBlockId: block.id,
        bookId: block.bookId,
      },
      onClick: () =>
        store.commands.selectCalendarEntry(block.dateKey, block.bookId),
      onDragStart: (event) => {
        event.dataTransfer?.setData(DRAG_MIME, dragPayload(block));
        event.dataTransfer?.setData('text/plain', block.title);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      },
    },
    el(
      'div',
      { className: 'hourly-calendar-block-head' },
      el('strong', { text: block.short }),
      el('span', { className: 'muted-copy', text: block.timeLabel }),
    ),
    el('div', {
      className: 'muted-copy',
      text: `${Math.round(block.plannedMinutes)}m · ${block.plannedPages.toFixed(1)} pages`,
    }),
    el(
      'div',
      { className: 'hourly-calendar-actions' },
      el('a', {
        className: 'ghost-button calendar-action-button',
        href: block.googleCalendarUrl,
        target: '_blank',
        rel: 'noreferrer',
        text: 'Google',
        onClick: (event) => event.stopPropagation(),
      }),
      button('Reset', {
        className: 'ghost-button calendar-action-button',
        onClick: (event) => {
          event.stopPropagation();
          store.commands.clearCalendarTimeBlock(block.dateKey, block.bookId);
        },
      }),
    ),
  );
}

function renderHourSlot(
  day: HourlyCalendarDay,
  minute: number,
  blocks: HourlyCalendarBlock[],
  store: PlannerStore,
): HTMLElement {
  return el(
    'div',
    {
      className: `hourly-calendar-slot${blocks.length ? ' has-blocks' : ''}`,
      dataset: {
        dateKey: day.key,
        minute: String(minute),
      },
      onDragOver: (event) => {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      },
      onDrop: (event) => {
        event.preventDefault();
        const payload = readDragPayload(event);
        if (!payload) return;
        store.commands.setCalendarTimeBlock(
          day.key,
          payload.bookId,
          minute,
          payload.durationMinutes,
        );
      },
    },
    el('div', {
      className: 'hourly-calendar-slot-label',
      text: formatClockMinute(minute),
    }),
    el(
      'div',
      { className: 'hourly-calendar-slot-body' },
      ...blocks.map((block) => renderBlock(block, store)),
    ),
  );
}

function renderDay(
  day: HourlyCalendarDay,
  hourLabels: Array<{ minute: number; label: string }>,
  store: PlannerStore,
): HTMLElement {
  return el(
    'div',
    {
      className: `calendar-day-cell hourly-calendar-day${day.blocks.length ? ' has-work' : ''}`,
    },
    el(
      'div',
      { className: 'calendar-cell-head' },
      el('strong', { text: day.label }),
      el('span', {
        className: 'calendar-day-summary muted-copy',
        text: day.statusLabel,
      }),
    ),
    el(
      'div',
      { className: 'hourly-calendar-slots' },
      ...hourLabels.map(({ minute }) =>
        renderHourSlot(
          day,
          minute,
          day.blocks.filter(
            (block) =>
              block.startMinute >= minute && block.startMinute < minute + 60,
          ),
          store,
        ),
      ),
    ),
  );
}

export function renderCalendarView(
  state: AppState,
  store: PlannerStore,
): HTMLElement {
  const viewModel = selectCalendarViewModel(state);
  if (!viewModel.weeks.length) {
    return panel(
      'Hourly calendar',
      { id: 'calendar:hourly' },
      emptyState(
        'No study blocks yet',
        'Solve the plan first; hourly blocks are derived from planned study days.',
      ),
    );
  }
  return el(
    'div',
    { className: 'stack-layout calendar-tab-view' },
    panel(
      'Hourly calendar',
      { id: 'calendar:hourly' },
      el(
        'div',
        { className: 'toolbar-row calendar-toolbar' },
        el('div', {
          className: 'muted-copy',
          text: 'Drag a study block onto an hour slot to persist when in the day you intend to read it.',
        }),
        el('div', { className: 'detail-spacer' }),
        el('a', {
          className: 'ghost-button',
          href: viewModel.icsDataUrl,
          download: 'difficulty-engine-study-calendar.ics',
          text: 'Export .ics',
        }),
      ),
      el('p', { className: 'muted-copy', text: viewModel.exportSummary }),
      renderCalendarSurface(
        viewModel.weeks,
        (day) => renderDay(day, viewModel.hourLabels, store),
        'calendar-board hourly-calendar-board',
      ),
    ),
  );
}
