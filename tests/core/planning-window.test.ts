import { describe, expect, it } from 'vitest';

import { horizonMonthsFromEndDate, targetEndDateKey } from '../../src/core/planning-window';

describe('planning window date conversion', () => {
  it('converts the stored month horizon into a visible target end date', () => {
    expect(targetEndDateKey('2026-01-05', 1)).toBe('2026-02-04');
  });

  it('round-trips target end dates back into the canonical month horizon', () => {
    const target = targetEndDateKey('2026-01-05', 6);
    expect(horizonMonthsFromEndDate('2026-01-05', target)).toBeCloseTo(6, 1);
  });

  it('keeps invalid or earlier dates inside the supported horizon range', () => {
    expect(horizonMonthsFromEndDate('bad-date', '2026-01-05')).toBe(1);
    expect(horizonMonthsFromEndDate('2026-01-05', '2025-01-05')).toBe(1);
  });
});
