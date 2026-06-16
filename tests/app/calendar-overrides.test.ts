import { describe, expect, it } from 'vitest';

import {
  withCalendarActivity,
  withCalendarEntryDone,
  withCalendarEntryMinutes,
} from '../../src/app/calendar-overrides';
import { normalizeCalendarActivityOverrides } from '../../src/core/project-normalize-overrides';
import { makeProject } from './store-test-utils';

describe('calendar actual overrides', () => {
  it('removes auto-filled planned progress when completion is unchecked', () => {
    const marked = withCalendarEntryDone(
      makeProject(),
      '2026-01-05',
      'book-1',
      true,
      { minutes: 45, pages: 12.5 },
    );

    expect(marked.manualOverrides.actuals['2026-01-05']?.['book-1']).toEqual({
      done: true,
      minutes: 45,
      pages: 12.5,
      autoFilledFromPlan: true,
    });

    const unmarked = withCalendarEntryDone(
      marked,
      '2026-01-05',
      'book-1',
      false,
    );

    expect(unmarked.manualOverrides.actuals['2026-01-05']).toBeUndefined();
  });

  it('preserves manually entered progress when completion is unchecked', () => {
    const withMinutes = withCalendarEntryMinutes(
      makeProject(),
      '2026-01-05',
      'book-1',
      45,
    );
    const marked = withCalendarEntryDone(
      withMinutes,
      '2026-01-05',
      'book-1',
      true,
      { minutes: 60, pages: 10 },
    );
    const unmarked = withCalendarEntryDone(
      marked,
      '2026-01-05',
      'book-1',
      false,
    );

    expect(unmarked.manualOverrides.actuals['2026-01-05']?.['book-1']).toEqual({
      minutes: 45,
    });
  });
});

describe('calendar activity default consistency', () => {
  it('uses the same default placement on add and on load/normalize', () => {
    const project = withCalendarActivity(makeProject(), { title: 'Gym' });
    const activities = project.manualOverrides.calendarActivities ?? {};
    const id = Object.keys(activities)[0] ?? '';
    expect(activities[id]?.startMinute).toBe(18 * 60);
    expect(activities[id]?.durationMinutes).toBe(120);

    // A partial (e.g. imported/AI) activity missing those fields must normalize
    // to the SAME defaults the add path uses — not 00:00 / 30 minutes.
    const normalized =
      normalizeCalendarActivityOverrides({ 'activity-1': { title: 'Imported' } }) ??
      {};
    expect(normalized['activity-1']?.startMinute).toBe(18 * 60);
    expect(normalized['activity-1']?.durationMinutes).toBe(120);
  });

  it('keeps an activity whose id sanitizes to empty by using the map key', () => {
    const normalized =
      normalizeCalendarActivityOverrides({
        'activity-1': { id: '日本語', title: 'Unicode id' },
      }) ?? {};
    expect(normalized['activity-1']).toBeDefined();
  });
});
