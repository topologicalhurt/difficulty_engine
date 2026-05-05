import { describe, expect, it } from 'vitest';

import { formatCssPercent, formatPercent } from '../../src/ui/format';

describe('UI formatting helpers', () => {
  it('separates rounded display percentages from exact CSS percentages', () => {
    expect(formatPercent(0.123)).toBe('12%');
    expect(formatCssPercent(0.123)).toBe('12.3%');
  });

  it('normalizes invalid CSS percentage input to zero', () => {
    expect(formatCssPercent(Number.NaN)).toBe('0%');
    expect(formatCssPercent(null)).toBe('0%');
  });
});
