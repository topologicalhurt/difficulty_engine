import { describe, expect, it } from 'vitest';

import { nextAvailableStart } from '../../src/app/selectors/calendar-time';

describe('hourly calendar focus windows', () => {
  it('packs evening focus into evening-to-night before falling back to daytime', () => {
    const occupied = [
      { startMinute: 17 * 60, endMinute: 18 * 60 },
      { startMinute: 18 * 60, endMinute: 19 * 60 },
      { startMinute: 19 * 60, endMinute: 20 * 60 },
      { startMinute: 20 * 60, endMinute: 21 * 60 },
      { startMinute: 21 * 60, endMinute: 22 * 60 },
    ];

    expect(nextAvailableStart(60, occupied, 'evening_focus')).toBe(22 * 60);
  });

  it('uses dense starts so short blocks do not leave artificial hour gaps', () => {
    expect(
      nextAvailableStart(
        30,
        [{ startMinute: 17 * 60, endMinute: 17 * 60 + 30 }],
        'evening_focus',
      ),
    ).toBe(17 * 60 + 30);
  });

  it('keeps the four focus modes inside their intended windows when feasible', () => {
    expect(nextAvailableStart(60, [], 'morning_focus')).toBe(7 * 60);
    expect(nextAvailableStart(60, [], 'afternoon_focus')).toBe(12 * 60);
    expect(nextAvailableStart(60, [], 'evening_focus')).toBe(17 * 60);
    expect(nextAvailableStart(60, [], 'night_focus')).toBe(20 * 60);
  });

  it('returns no placement instead of forcing an overlap when the day is full', () => {
    expect(
      nextAvailableStart(
        60,
        [{ startMinute: 0, endMinute: 24 * 60 }],
        'cognitive_default',
      ),
    ).toBeNull();
  });
});
