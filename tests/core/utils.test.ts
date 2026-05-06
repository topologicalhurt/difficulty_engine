import { describe, expect, it } from 'vitest';

import {
  compactJoin,
  compactString,
  compactStrings,
  uniqueCompactStrings,
} from '../../src/core/utils';

describe('shared utility helpers', () => {
  it('normalizes string lists without repeating local trim/dedupe helpers', () => {
    expect(compactString('  Linear Algebra  ')).toBe('Linear Algebra');
    expect(compactStrings(['  DSP ', '', null, ' circuits '])).toEqual([
      'DSP',
      'circuits',
    ]);
    expect(compactJoin(['  DSP ', null, ' circuits '], ' · ')).toBe(
      'DSP · circuits',
    );
    expect(
      uniqueCompactStrings(['  DSP ', 'DSP', 'circuits', undefined], 1),
    ).toEqual(['DSP']);
  });
});
