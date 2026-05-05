import { describe, expect, it } from 'vitest';

import {
  withCalendarEntryDone,
  withCalendarEntryMinutes,
} from '../../src/app/calendar-overrides';
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
