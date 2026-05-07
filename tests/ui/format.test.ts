import { describe, expect, it } from 'vitest';

import {
  formatCssPercent,
  formatPages,
  formatPercent,
} from '../../src/ui/format';

describe('UI formatting helpers', () => {
  it('separates rounded display percentages from exact CSS percentages', () => {
    expect(formatPercent(0.123)).toBe('12%');
    expect(formatCssPercent(0.123)).toBe('12.3%');
  });

  it('normalizes invalid CSS percentage input to zero', () => {
    expect(formatCssPercent(Number.NaN)).toBe('0%');
    expect(formatCssPercent(null)).toBe('0%');
  });

  it('shows user-facing page counts as whole pages', () => {
    expect(formatPages(7.4)).toBe('7');
    expect(formatPages(7.5)).toBe('8');
  });
});
