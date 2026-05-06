import { describe, expect, it } from 'vitest';

import {
  formatCssPercent,
  formatOneDecimal,
  formatRatioPercent,
  formatWholeNumber,
  formatWholePercent,
} from '../../src/core/number-format';

describe('number formatting helpers', () => {
  it('formats numbers consistently for app selectors and UI display', () => {
    expect(formatOneDecimal(1.24)).toBe('1.2');
    expect(formatWholeNumber(12.6)).toBe('13');
    expect(formatWholePercent(42.4)).toBe('42%');
    expect(formatRatioPercent(0.123)).toBe('12%');
    expect(formatCssPercent(0.123)).toBe('12.3%');
  });

  it('normalizes invalid numeric input to zero', () => {
    expect(formatOneDecimal(Number.NaN)).toBe('0.0');
    expect(formatWholeNumber(null)).toBe('0');
    expect(formatRatioPercent(undefined)).toBe('0%');
  });
});
