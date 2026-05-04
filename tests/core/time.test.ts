import { describe, expect, it } from 'vitest';

import {
  addLocalDays,
  dateKeyFromDate,
  endOfStudyWeek,
  parseLocalDateKey,
  startOfStudyWeek,
} from '../../src/core/time';

describe('date and calendar helpers', () => {
  it('parses and formats date keys through the shared helper path', () => {
    expect(dateKeyFromDate(parseLocalDateKey('2026-05-03'))).toBe('2026-05-03');
  });

  it('adds local days without mutating the input date', () => {
    const date = parseLocalDateKey('2026-05-03');
    const next = addLocalDays(date, 2);

    expect(dateKeyFromDate(date)).toBe('2026-05-03');
    expect(dateKeyFromDate(next)).toBe('2026-05-05');
  });

  it('uses Monday-to-Sunday study weeks for calendar grids', () => {
    const sunday = parseLocalDateKey('2026-05-03');

    expect(dateKeyFromDate(startOfStudyWeek(sunday))).toBe('2026-04-27');
    expect(dateKeyFromDate(endOfStudyWeek(sunday))).toBe('2026-05-03');
  });
});
