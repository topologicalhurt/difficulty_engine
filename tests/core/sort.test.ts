import { describe, expect, it } from 'vitest';

import {
  compareChain,
  compareNumberAsc,
  compareNumberDesc,
  compareText,
} from '../../src/core/sort';

describe('sort helpers', () => {
  it('composes deterministic numeric and text tie-breaks', () => {
    const items = [
      { label: 'Beta', score: 2 },
      { label: 'Alpha', score: 2 },
      { label: 'Gamma', score: 3 },
    ].sort((left, right) =>
      compareChain(
        compareNumberDesc(left.score, right.score),
        compareText(left.label, right.label),
      ),
    );

    expect(items.map((item) => item.label)).toEqual(['Gamma', 'Alpha', 'Beta']);
    expect(compareNumberAsc(1, 2)).toBeLessThan(0);
  });
});
