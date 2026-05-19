// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import { selectCalendarViewModel } from '../../src/app/selectors/calendar';
import { parseLocalDateKey } from '../../src/core/time';
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
    expect(root.textContent).toContain('Afternoon to evening');
    expect(root.textContent).toContain('Night focus');
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

    const next = [...root.querySelectorAll('button')].find(
      (button) => button.textContent === 'Next week',
    );
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

  it('shows activities and places automatic study blocks around them', () => {
    const store = makeStore();
    store.commands.addCalendarActivity({
      title: 'Repairs',
      color: '#ff8800',
      mode: 'fixed_weekly',
      days: [1],
      startMinute: 9 * 60,
      durationMinutes: 120,
    });

    const viewModel = selectCalendarViewModel(store.selectors.getState());
    const monday = viewModel.weeks[0]?.days.find((day) =>
      day.activityBlocks.some((block) => block.title === 'Repairs'),
    );
    const firstStudyBlock = monday?.blocks[0];

    expect(monday?.activityBlocks[0]?.timeLabel).toBe('09:00-11:00');
    expect(firstStudyBlock?.startMinute).not.toBe(9 * 60);
  });

  it('rounds automatic study blocks to visible quarter-hour boundaries', () => {
    const store = makeStore();
    store.commands.setCalendarLearningMode('evening_focus');

    const blocks = selectCalendarViewModel(
      store.selectors.getState(),
    ).weeks[0]?.days.flatMap((day) => day.blocks);

    expect(blocks?.length).toBeGreaterThan(0);
    blocks?.forEach((block) => {
      expect(block.startMinute % 15).toBe(0);
      expect(block.endMinute % 15).toBe(0);
      expect(block.timeLabel).not.toContain(':59');
    });
  });

  it('spans activity blocks across their full duration', () => {
    const store = makeStore();
    store.commands.addCalendarActivity({
      title: 'Practice',
      color: '#4488ff',
      mode: 'fixed_weekly',
      days: [1],
      startMinute: 9 * 60,
      durationMinutes: 180,
      dailyDurations: { '1': 180 },
    });

    const view = renderCalendarView(store.selectors.getState(), store);
    const activity = view.querySelector<HTMLElement>('.hourly-activity-block');

    expect(activity?.style.gridRow).toBe('10 / span 3');
    expect(activity?.style.getPropertyValue('--calendar-block-height')).toBe(
      '12.5%',
    );
  });

  it('moves a dragged book away from a newly added activity conflict', () => {
    const store = makeStore();
    const firstBlock = selectCalendarViewModel(
      store.selectors.getState(),
    ).weeks[0]?.days.flatMap((day) => day.blocks)[0];
    if (!firstBlock) throw new Error('Expected a calendar block.');

    store.commands.setCalendarTimeBlock(
      firstBlock.dateKey,
      firstBlock.bookId,
      9 * 60,
      120,
    );
    store.commands.addCalendarActivity({
      title: 'Lab',
      color: '#ff8800',
      mode: 'fixed_weekly',
      days: [1],
      startMinute: 9 * 60,
      durationMinutes: 120,
      dailyDurations: { '1': 120 },
    });

    const movedBlock = selectCalendarViewModel(store.selectors.getState())
      .weeks[0]?.days.flatMap((day) => day.blocks)
      .find((block) => block.id === firstBlock.id);

    expect(movedBlock?.startMinute).not.toBe(9 * 60);
  });

  it('uses per-day activity hours and rotates fixed days by week', () => {
    const store = makeStore();
    store.commands.addCalendarActivity({
      title: 'Drumming',
      color: '#44cc88',
      mode: 'fixed_weekly',
      days: [2],
      startMinute: 8 * 60,
      durationMinutes: 120,
      dailyDurations: { '2': 360 },
      rotationStepDays: 1,
      rotationIntervalWeeks: 1,
    });

    const firstWeek = selectCalendarViewModel(store.selectors.getState());
    const firstActivityDay = firstWeek.weeks[0]?.days.find((day) =>
      day.activityBlocks.some((block) => block.title === 'Drumming'),
    );
    store.commands.setCalendarWeekIndex(1);
    const secondWeek = selectCalendarViewModel(store.selectors.getState());
    const secondActivityDay = secondWeek.weeks[0]?.days.find((day) =>
      day.activityBlocks.some((block) => block.title === 'Drumming'),
    );

    expect(firstActivityDay?.label).toContain('Tue');
    expect(firstActivityDay?.activityBlocks[0]?.timeLabel).toBe('08:00-14:00');
    expect(secondActivityDay?.label).toContain('Wed');
  });

  it('schedules flexible weekly activities only on selected weekdays', () => {
    const store = makeStore();
    store.commands.addCalendarActivity({
      title: 'Weekend practice',
      color: '#44cc88',
      mode: 'flexible_weekly',
      days: [0, 6],
      durationMinutes: 60,
      sessionsPerWeek: 2,
    });

    const activityDays = selectCalendarViewModel(store.selectors.getState())
      .weeks[0]?.days.filter((day) =>
        day.activityBlocks.some((block) => block.title === 'Weekend practice'),
      )
      .map((day) => parseLocalDateKey(day.key).getDay());

    expect(activityDays?.sort()).toEqual([0, 6]);
  });

  it('surfaces unscheduled study blocks when activities fill the day', () => {
    const store = makeStore();
    const initialDay = selectCalendarViewModel(
      store.selectors.getState(),
    ).weeks[0]?.days.find((day) => day.blocks.length > 0);
    if (!initialDay) throw new Error('Expected a planned calendar day.');
    const weekday = parseLocalDateKey(initialDay.key).getDay();

    store.commands.addCalendarActivity({
      title: 'All-day first half',
      color: '#ff8800',
      mode: 'fixed_weekly',
      days: [weekday],
      startMinute: 0,
      durationMinutes: 12 * 60,
      dailyDurations: { [String(weekday)]: 12 * 60 },
    });
    store.commands.addCalendarActivity({
      title: 'All-day second half',
      color: '#4488ff',
      mode: 'fixed_weekly',
      days: [weekday],
      startMinute: 12 * 60,
      durationMinutes: 12 * 60,
      dailyDurations: { [String(weekday)]: 12 * 60 },
    });

    const updatedDay = selectCalendarViewModel(
      store.selectors.getState(),
    ).weeks[0]?.days.find((day) => day.key === initialDay.key);
    const view = renderCalendarView(store.selectors.getState(), store);

    expect(updatedDay?.blocks).toHaveLength(0);
    expect(updatedDay?.unscheduledBlocks.length).toBeGreaterThan(0);
    expect(view.textContent).toContain('Unscheduled study');
    expect(view.textContent).toContain('No free same-day slot');
  });

  it('shows reading pace indicators from logged actuals', () => {
    const store = makeStore();
    const firstBlock = selectCalendarViewModel(store.selectors.getState())
      .weeks[0]?.days.flatMap((day) => day.blocks)
      .find((block) => block.plannedPages > 0 && block.plannedMinutes > 1);
    if (!firstBlock) throw new Error('Expected a calendar block.');

    store.commands.setCalendarEntryMinutes(
      firstBlock.dateKey,
      firstBlock.bookId,
      Math.max(1, Math.round(firstBlock.plannedMinutes / 2)),
    );
    store.commands.setCalendarEntryPages(
      firstBlock.dateKey,
      firstBlock.bookId,
      firstBlock.plannedPages,
    );

    const updatedBlock = selectCalendarViewModel(store.selectors.getState())
      .weeks[0]?.days.flatMap((day) => day.blocks)
      .find((block) => block.id === firstBlock.id);

    expect(updatedBlock?.performanceTone).toBe('ahead');
    expect(updatedBlock?.performanceLabel).toContain('ahead');
  });

  it('adds activities from the Calendar settings controls', () => {
    const store = makeStore();
    store.commands.setActiveView('calendar');
    const root = document.createElement('section');

    renderActiveTabBody(root, store.selectors.getState(), store);
    const title = root.querySelector<HTMLInputElement>(
      '.calendar-activity-title-input',
    );
    const weeklyHours = root.querySelector('.calendar-activity-weekly-input');
    const add = [...root.querySelectorAll('button')].find(
      (button) => button.textContent === 'Add activity',
    );
    if (!title || !(add instanceof HTMLButtonElement)) {
      throw new Error('Expected activity controls.');
    }
    title.value = 'Gym';
    add.click();

    expect(weeklyHours).toBeNull();
    expect(
      Object.values(
        store.selectors.getProject().manualOverrides.calendarActivities ?? {},
      )[0]?.title,
    ).toBe('Gym');
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
