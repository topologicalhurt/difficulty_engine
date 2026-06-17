import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ACTIVITY_COLOR,
  gradientColor,
  groupColor,
  hashText,
  hslColor,
  normalizeHexColor,
  normalizedRange,
  PLAN_MONO_GROUP_COLOR_OPTIONS,
} from '../../src/core/display-colors';

describe('display color helpers', () => {
  it('normalizes hex colors consistently, trimming whitespace', () => {
    expect(normalizeHexColor('#ABCDEF', DEFAULT_ACTIVITY_COLOR)).toBe('#abcdef');
    // Trim so the add path and the load path agree on padded values.
    expect(normalizeHexColor('  #abcdef  ', DEFAULT_ACTIVITY_COLOR)).toBe(
      '#abcdef',
    );
    expect(normalizeHexColor('not-a-color', DEFAULT_ACTIVITY_COLOR)).toBe(
      DEFAULT_ACTIVITY_COLOR,
    );
    expect(normalizeHexColor(undefined, DEFAULT_ACTIVITY_COLOR)).toBe(
      DEFAULT_ACTIVITY_COLOR,
    );
  });

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
