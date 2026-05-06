import { describe, expect, it } from 'vitest';

import {
  gradientColor,
  groupColor,
  hashText,
  hslColor,
  normalizedRange,
  PLAN_MONO_GROUP_COLOR_OPTIONS,
} from '../../src/core/display-colors';

describe('display color helpers', () => {
  it('keeps group color hashing deterministic', () => {
    expect(hashText('Electronics')).toBe(hashText('Electronics'));
    expect(groupColor('Electronics')).toBe(groupColor('Electronics'));
    expect(groupColor('')).toBe('hsl(0 72% 58%)');
  });

  it('supports restrained group palettes without local hashing', () => {
    expect(
      groupColor('', PLAN_MONO_GROUP_COLOR_OPTIONS),
    ).toMatch(/^hsl\((16\d|17\d|18\d|19[0-3]) 42% 55%\)$/);
  });

  it('formats HSL gradients and clamps range percentages', () => {
    expect(hslColor(18.4, 72, 56)).toBe('hsl(18 72% 56%)');
    expect(gradientColor(-1, 145, 18)).toBe('hsl(145 72% 56%)');
    expect(gradientColor(2, 145, 18, 58)).toBe('hsl(18 72% 58%)');
    expect(normalizedRange([10, 20, 30], 20)).toBe(0.5);
    expect(normalizedRange([10, 10], 20)).toBe(0.5);
  });
});
