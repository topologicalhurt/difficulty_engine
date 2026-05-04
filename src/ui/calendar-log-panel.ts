import { calendarDetailText, type PlanViewModel } from '../app/selectors/plan';
import type { CalendarEntry, PlannerStore } from '../core/types';
import { button, el } from './dom';
import { formatOneDecimal, round0 } from './format';

const MAX_ACTUAL_PAGES_INPUT = '10000';

function stopCalendarAction(event: Event): void {
  event.stopPropagation();
}

export function renderCalendarEntryActions(
  dayKey: string,
  entry: CalendarEntry,
  store: PlannerStore,
): HTMLElement {
  const actualValue = entry.actualMinutes ?? entry.mins;
  const actualPages = entry.actualPages ?? entry.readPages + entry.skimPages;
  const actualInput = el('input', {
    className: 'calendar-time-input',
    type: 'number',
    value: String(round0(actualValue)),
    title: 'Actual minutes spent',
    ariaLabel: `Actual minutes for ${entry.short}`,
    onClick: stopCalendarAction,
    onChange: (event) => {
      stopCalendarAction(event);
      store.commands.setCalendarEntryMinutes(dayKey, entry.bookId, Number((event.target as HTMLInputElement).value));
    },
  });
  actualInput.min = '0';
  actualInput.max = '1440';
  actualInput.step = '5';

  const pagesInput = el('input', {
    className: 'calendar-time-input',
    type: 'number',
    value: String(formatOneDecimal(actualPages)),
    title: 'Actual pages read',
    ariaLabel: `Actual pages for ${entry.short}`,
    onClick: stopCalendarAction,
    onChange: (event) => {
      stopCalendarAction(event);
      store.commands.setCalendarEntryPages(dayKey, entry.bookId, Number((event.target as HTMLInputElement).value));
    },
  });
  pagesInput.min = '0';
  pagesInput.max = MAX_ACTUAL_PAGES_INPUT;
  pagesInput.step = '0.1';

  return el(
    'div',
    { className: 'calendar-chip-actions', onClick: stopCalendarAction },
    el(
      'div',
      { className: 'calendar-log-fields' },
      el('label', { className: 'calendar-log-field' }, el('span', { text: 'Minutes spent' }), actualInput),
      el('label', { className: 'calendar-log-field' }, el('span', { text: 'Pages read' }), pagesInput),
    ),
    button(entry.done ? 'Done' : 'Mark done', {
      className: entry.done ? 'primary-button calendar-action-button' : 'ghost-button calendar-action-button',
      onClick: (event) => {
        stopCalendarAction(event);
        store.commands.markCalendarEntryDone(dayKey, entry.bookId, !entry.done);
      },
    }),
    button('Skip', {
      className: 'ghost-button calendar-action-button',
      onClick: (event) => {
        stopCalendarAction(event);
        store.commands.deferCalendarEntry(dayKey, entry.bookId);
      },
    }),
    entry.actualOverride || entry.done
      ? button('Clear', {
          className: 'ghost-button calendar-action-button',
          onClick: (event) => {
            stopCalendarAction(event);
            store.commands.clearCalendarEntryActual(dayKey, entry.bookId);
          },
        })
      : null,
  );
}

export function renderSelectedCalendarLogPanel(
  viewModel: PlanViewModel,
  store: PlannerStore,
): HTMLElement | null {
  const selected = viewModel.selectedCalendarEntry;
  if (!selected) return null;
  const day = viewModel.calendarWeeks
    .flatMap((week) => week.days)
    .find((candidate) => candidate.key === selected.dateKey);
  const entry = day?.entries.find((candidate) => candidate.bookId === selected.bookId);
  if (!entry) return null;

  return el(
    'section',
    { className: 'calendar-log-panel' },
    el(
      'div',
      { className: 'calendar-log-panel-head' },
      el('div', {}, el('strong', { text: `Log progress: ${entry.short}` }), el('div', { className: 'muted-copy', text: selected.dateKey })),
      el('div', { className: 'muted-copy', text: `${round0(entry.mins)}m planned · ${formatOneDecimal(entry.readPages + entry.skimPages)} pages planned` }),
    ),
    el('div', { className: 'calendar-chip-detail muted-copy', text: calendarDetailText(entry) }),
    renderCalendarEntryActions(selected.dateKey, entry, store),
  );
}
