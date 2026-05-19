// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import { selectCalendarViewModel } from '../../src/app/selectors/calendar';
import { renderActiveTabBody } from '../../src/ui/active-tab-host';
import { renderCalendarView } from '../../src/ui/calendar-view';
import { makeStore } from '../app/store-test-utils';

const DRAG_MIME = 'application/x-difficulty-calendar-block';

describe('calendar view', () => {
  it('renders the Calendar tab with Google and ICS integration affordances', () => {
    const store = makeStore();
    store.commands.setActiveView('calendar');
    const root = document.createElement('section');

    renderActiveTabBody(root, store.selectors.getState(), store);
    const viewModel = selectCalendarViewModel(store.selectors.getState());

    expect(root.dataset.activeView).toBe('calendar');
    expect(root.textContent).toContain('Hourly calendar');
    expect(viewModel.hourLabels.map((hour) => hour.label)).toContain('23:00');
    expect(viewModel.weeks).toHaveLength(1);
    expect(root.querySelector('.panel-toggle-button')).toBeNull();
    const exportLink = root.querySelector('a[download$=".ics"]');
    expect(exportLink?.getAttribute('href')).toContain('BEGIN%3AVCALENDAR');
    expect(
      root.querySelector('a[href^="https://calendar.google.com"]'),
    ).toBeTruthy();
  });

  it('pages the hourly calendar by week instead of mounting the full plan', () => {
    const store = makeStore();
    store.commands.setActiveView('calendar');
    const root = document.createElement('section');

    renderActiveTabBody(root, store.selectors.getState(), store);
    const initial = selectCalendarViewModel(store.selectors.getState());
    expect(initial.weekCount).toBeGreaterThanOrEqual(initial.weeks.length);
    if (!initial.canGoNext) return;

    const next = root.querySelectorAll('button')[1];
    if (!(next instanceof HTMLButtonElement)) {
      throw new Error('Expected the next-week button.');
    }
    next.click();

    expect(store.selectors.getState().ui.calendarWeekIndex).toBe(1);
  });

  it('does not rebuild the hourly grid for simple block selection', () => {
    const store = makeStore();
    store.commands.setActiveView('calendar');
    const root = document.createElement('section');

    renderActiveTabBody(root, store.selectors.getState(), store);
    const initialBody = root.firstElementChild;
    const block = root.querySelector('.hourly-calendar-block');
    if (!(block instanceof HTMLElement)) {
      throw new Error('Expected an hourly block.');
    }

    block.click();
    renderActiveTabBody(root, store.selectors.getState(), store);

    expect(root.firstElementChild).toBe(initialBody);
  });

  it('persists a dropped study block on the target hour', () => {
    const store = makeStore();
    const view = renderCalendarView(store.selectors.getState(), store);
    const viewModel = selectCalendarViewModel(store.selectors.getState());
    const firstBlock = viewModel.weeks[0]?.days.flatMap((day) => day.blocks)[0];
    if (!firstBlock) throw new Error('Expected a calendar block.');
    const targetSlot = view.querySelector(
      `[data-date-key="${firstBlock.dateKey}"][data-minute="780"]`,
    );
    if (!targetSlot) throw new Error('Expected a target hour slot.');
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', {
      value: {
        dropEffect: '',
        getData: vi.fn((type: string) =>
          type === DRAG_MIME
            ? JSON.stringify({
                bookId: firstBlock.bookId,
                durationMinutes: firstBlock.durationMinutes,
              })
            : '',
        ),
      },
    });

    targetSlot.dispatchEvent(drop);

    expect(
      store.selectors.getProject().manualOverrides.timeBlocks?.[
        firstBlock.dateKey
      ]?.[firstBlock.bookId]?.startMinute,
    ).toBe(13 * 60);
  });
});
