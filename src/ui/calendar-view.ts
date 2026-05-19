import {
  formatClockMinute,
  selectCalendarViewModel,
  type CalendarViewModel,
  type HourlyCalendarBlock,
  type HourlyCalendarDay,
} from '../app/selectors/calendar';
import type { HourlyCalendarActivityBlock } from '../app/selectors/calendar-activity-blocks';
import type { AppState, PlannerStore } from '../core/types';
import { button, el, emptyState, panel } from './dom';
import { renderCalendarSurface } from './calendar-surface';
import { renderActivitySettings } from './calendar-settings-panel';
import { selectInput } from './form-controls';

const DRAG_MIME = 'application/x-difficulty-calendar-block';
const DAY_MINUTES = 24 * 60;

function applyTimedLayout(
  node: HTMLElement,
  startMinute: number,
  durationMinutes: number,
): void {
  const startRow = Math.floor(startMinute / 60) + 1;
  const spanRows = Math.max(1, Math.ceil(durationMinutes / 60));
  node.style.gridRow = `${startRow} / span ${spanRows}`;
  node.style.setProperty(
    '--calendar-block-top',
    `${(startMinute / DAY_MINUTES) * 100}%`,
  );
  node.style.setProperty(
    '--calendar-block-height',
    `${(durationMinutes / DAY_MINUTES) * 100}%`,
  );
}

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
  const node = el(
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
    el('div', {
      className: `hourly-calendar-performance performance-${block.performanceTone}`,
      text: block.performanceLabel,
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
  node.style.setProperty('--calendar-book-color', block.color);
  applyTimedLayout(node, block.startMinute, block.durationMinutes);
  return node;
}

function renderActivityBlock(block: HourlyCalendarActivityBlock): HTMLElement {
  const node = el(
    'article',
    {
      className: `hourly-activity-block activity-${block.mode}`,
      title: `${block.title} · ${block.timeLabel}`,
      dataset: {
        activityId: block.activityId,
      },
    },
    el(
      'div',
      { className: 'hourly-calendar-block-head' },
      el('strong', { text: block.title }),
      el('span', { className: 'muted-copy', text: block.timeLabel }),
    ),
    el('div', {
      className: 'muted-copy',
      text:
        block.mode === 'flexible_weekly'
          ? 'Flexible weekly activity'
          : 'Fixed weekly activity',
    }),
  );
  node.style.setProperty('--calendar-activity-color', block.color);
  applyTimedLayout(node, block.startMinute, block.durationMinutes);
  return node;
}

function renderHourSlot(
  day: HourlyCalendarDay,
  minute: number,
  store: PlannerStore,
): HTMLElement {
  const node = el(
    'div',
    {
      className: 'hourly-calendar-slot',
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
  );
  node.style.gridRow = `${Math.floor(minute / 60) + 1}`;
  return node;
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
      ...hourLabels.map(({ minute }) => renderHourSlot(day, minute, store)),
      ...day.activityBlocks.map((block) => renderActivityBlock(block)),
      ...day.blocks.map((block) => renderBlock(block, store)),
    ),
  );
}

function renderBookJump(
  viewModel: CalendarViewModel,
  store: PlannerStore,
): HTMLElement | null {
  if (!viewModel.bookWindows.length) return null;
  const select = selectInput(
    viewModel.bookWindows[0]?.bookId ?? '',
    viewModel.bookWindows.map((window) => ({
      value: window.bookId,
      label: window.label,
    })),
    { className: 'calendar-book-jump-select' },
  );
  const jump = (edge: 'start' | 'finish'): void => {
    const window = viewModel.bookWindows.find(
      (entry) => entry.bookId === select.value,
    );
    if (!window) return;
    store.commands.setCalendarWeekIndex(
      edge === 'start' ? window.startWeekIndex : window.endWeekIndex,
    );
  };
  return el(
    'div',
    { className: 'hourly-calendar-book-jump' },
    select,
    button('Jump to start', {
      className: 'ghost-button calendar-action-button',
      onClick: () => jump('start'),
    }),
    button('Jump to finish', {
      className: 'ghost-button calendar-action-button',
      onClick: () => jump('finish'),
    }),
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
      { id: 'calendar:hourly', collapsible: false },
      emptyState(
        'No study blocks yet',
        'Solve the plan first; hourly blocks are derived from planned study days.',
      ),
    );
  }
  return el(
    'div',
    { className: 'stack-layout calendar-tab-view' },
    renderActivitySettings(viewModel, store),
    panel(
      'Hourly calendar',
      {
        id: 'calendar:hourly',
        className: 'hourly-calendar-panel',
        collapsible: false,
      },
      el(
        'div',
        { className: 'toolbar-row calendar-toolbar' },
        el(
          'div',
          { className: 'hourly-calendar-week-controls' },
          button('Previous week', {
            className: 'ghost-button calendar-action-button',
            disabled: !viewModel.canGoPrevious,
            onClick: () =>
              store.commands.setCalendarWeekIndex(
                viewModel.selectedWeekIndex - 1,
              ),
          }),
          el('strong', {
            className: 'hourly-calendar-week-label',
            text: viewModel.selectedWeekLabel,
          }),
          button('Next week', {
            className: 'ghost-button calendar-action-button',
            disabled: !viewModel.canGoNext,
            onClick: () =>
              store.commands.setCalendarWeekIndex(
                viewModel.selectedWeekIndex + 1,
              ),
          }),
          el('span', {
            className: 'muted-copy',
            text: `${viewModel.selectedWeekIndex + 1} / ${viewModel.weekCount}`,
          }),
        ),
        el('div', {
          className: 'muted-copy',
          text: 'Drag a study block onto an hour slot to persist when in the day you intend to read it.',
        }),
        renderBookJump(viewModel, store),
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
