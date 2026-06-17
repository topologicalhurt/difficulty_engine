import { el, type Child } from './dom';

export interface CalendarSurfaceDay {
  key: string;
}

export interface CalendarSurfaceWeek<TDay extends CalendarSurfaceDay> {
  key: string;
  label: string;
  days: TDay[];
}

export function renderCalendarSurface<TDay extends CalendarSurfaceDay>(
  weeks: CalendarSurfaceWeek<TDay>[],
  renderDay: (day: TDay) => Child,
  className = 'calendar-board',
): HTMLElement {
  return el(
    'div',
    { className },
    ...weeks.map((week) =>
      el(
        'section',
        { className: 'calendar-week' },
        el('div', { className: 'calendar-week-label', text: week.label }),
        el(
          'div',
          { className: 'calendar-week-grid' },
          ...week.days.map((day) => renderDay(day)),
        ),
      ),
    ),
  );
}
