import { describe, expect, it } from 'vitest';

import {
  extractPublishedYear,
  firstValidIsbn,
  normalizeProviderText,
  normalizeProviderTextArray,
} from '../../src/infra/source-metadata';

describe('source metadata helpers', () => {
  it('normalizes provider text consistently across metadata sources', () => {
    expect(normalizeProviderText('  <b>Analog</b>\nSynthesizers  ')).toBe(
      'Analog Synthesizers',
    );
    expect(
      normalizeProviderTextArray(['  DSP ', '<i>Circuits</i>', '']),
    ).toEqual(['DSP', 'Circuits']);
  });

  it('extracts bounded publication years and valid ISBNs', () => {
    expect(extractPublishedYear('Revised edition, 2016')).toBe(2016);
    expect(extractPublishedYear('Printed 1400')).toBeNull();
    expect(firstValidIsbn(['bad', '978-0-262-03384-8'])).toBe('9780262033848');
  });
});
