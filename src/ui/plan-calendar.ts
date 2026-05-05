import {
  calendarBadges,
  calendarDetailText,
  type PlanViewModel,
} from '../app/selectors/plan';
import type { CalendarEntry, PlannerStore } from '../core/types';
import { badge, button, card, el, emptyState } from './dom';
import { formatOneDecimal, round0 } from './format';

function activateCalendarEntry(
  dayKey: string,
  entry: CalendarEntry,
  store: PlannerStore,
): void {
  store.commands.selectCalendarEntry(dayKey, entry.bookId);
}

function renderCalendarChip(
  viewModel: PlanViewModel,
  dayKey: string,
  entry: CalendarEntry,
  store: PlannerStore,
): HTMLElement {
  const detail = calendarDetailText(entry);
  const active =
    viewModel.selectedCalendarEntry?.dateKey === dayKey &&
    viewModel.selectedCalendarEntry.bookId === entry.bookId;
  const chip = el(
    'div',
    {
      className: `calendar-chip${entry.boosted ? ' boosted' : ''}${active ? ' selected' : ''}`,
      role: 'button',
      tabIndex: 0,
      title: detail,
      ariaLabel: detail,
      onClick: (event) => {
        event.stopPropagation();
        activateCalendarEntry(dayKey, entry, store);
      },
      onKeyDown: (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        activateCalendarEntry(dayKey, entry, store);
      },
    },
    el(
      'div',
      { className: 'calendar-chip-top' },
      el(
        'strong',
        { className: 'calendar-chip-title' },
        entry.boosted
          ? el('span', {
              className: 'calendar-boost-icon',
              title: 'Boost day',
              text: '!',
            })
          : null,
        el('span', { text: entry.short }),
      ),
      el('span', { className: 'muted-copy', text: `${round0(entry.mins)}m` }),
    ),
    el('div', {
      className: 'muted-copy',
      text: `${formatOneDecimal(entry.readPages + entry.skimPages)} pages`,
    }),
    el(
      'div',
      { className: 'badge-row compact-badge-row' },
      ...calendarBadges(entry).map((item) => badge(item.label, item.tone)),
    ),
    el('div', {
      className: 'calendar-chip-summary',
      text: active ? 'Logging selected' : 'Click to log',
    }),
  );
  chip.style.borderLeft = `3px solid ${viewModel.colors.byBookId[entry.bookId] || 'hsl(160 42% 55%)'}`;
  return chip;
}

export function renderCalendar(
  viewModel: PlanViewModel,
  store: PlannerStore,
): HTMLElement {
  const weeks = viewModel.calendarWeeks;
  if (!weeks.length) {
    return card(
      'Study calendar',
      emptyState(
        'No study days yet',
        'Once the schedule solves, the calendar appears here.',
      ),
    );
  }

  return card(
    'Study calendar',
    el(
      'div',
      { className: 'muted-copy' },
      'Dense week-grid view of the solved day plan. Click a study day or item to log progress in the side panel.',
    ),
    el(
      'div',
      { className: 'calendar-board' },
      ...weeks.map((week) =>
        el(
          'section',
          { className: 'calendar-week' },
          el('div', { className: 'calendar-week-label', text: week.label }),
          el(
            'div',
            { className: 'calendar-week-grid' },
            ...week.days.map((day) => {
              const selectDay = (): void => {
                const firstEntry = day.sortedEntries[0];
                if (firstEntry)
                  activateCalendarEntry(day.key, firstEntry, store);
              };
              return el(
                'div',
                {
                  className: `calendar-day-cell status-${day.status}${day.entries.length ? ' has-work clickable-cell' : ''}${day.isCurrentMonth ? '' : ' muted-day'}`,
                  title: day.statusDetail,
                  onClick: selectDay,
                  onKeyDown: (event) => {
                    if (
                      !day.sortedEntries.length ||
                      (event.key !== 'Enter' && event.key !== ' ')
                    )
                      return;
                    event.preventDefault();
                    selectDay();
                  },
                  tabIndex: day.sortedEntries.length ? 0 : undefined,
                },
                el(
                  'div',
                  { className: 'calendar-cell-head' },
                  el(
                    'div',
                    { className: 'calendar-cell-date' },
                    el('span', {
                      className: 'calendar-cell-weekday',
                      text: day.dayLabel,
                    }),
                    el('strong', { text: day.dayNumber }),
                  ),
                  el(
                    'div',
                    { className: 'calendar-day-summary muted-copy' },
                    day.entrySummary,
                  ),
                ),
                day.entries.length
                  ? el(
                      'div',
                      { className: 'calendar-entry-list week-grid-list' },
                      ...day.sortedEntries.map((entry) =>
                        renderCalendarChip(viewModel, day.key, entry, store),
                      ),
                    )
                  : el('div', {
                      className: 'muted-copy calendar-empty',
                      text: day.statusLabel,
                      title: day.statusDetail,
                    }),
                day.missedEntries.length
                  ? el(
                      'div',
                      { className: 'calendar-missed' },
                      el('div', {
                        className: 'muted-copy',
                        text: `${day.missedEntries.length} deferred`,
                      }),
                      ...day.missedEntries.map((entry) =>
                        button(`Restore ${entry.short}`, {
                          className: 'ghost-button calendar-action-button',
                          onClick: (event) => {
                            event.stopPropagation();
                            store.commands.clearCalendarEntryActual(
                              day.key,
                              entry.bookId,
                            );
                          },
                        }),
                      ),
                    )
                  : null,
              );
            }),
          ),
        ),
      ),
    ),
  );
}
