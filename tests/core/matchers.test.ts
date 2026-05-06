import { describe, expect, it } from 'vitest';

import {
  bookMatchDecision,
  genericTitleAuthorConflict,
  jaccardTokenSimilarity,
  matchTokens,
  normalizeMatcherText,
  tokenContainmentSimilarity,
} from '../../src/core/matchers';

describe('shared matcher primitives', () => {
  it('normalizes English technical titles while preserving useful tokens', () => {
    expect(normalizeMatcherText('Linear Algebra—Done Right (4th Ed.)')).toBe(
      'linear algebra-done right 4th ed',
    );
    expect(matchTokens('Café circuits, op-amps & DSP!')).toEqual([
      'cafe',
      'circuits',
      'op-amps',
      'dsp',
    ]);
  });

  it('scores punctuation and subtitle variants without accepting unrelated books', () => {
    const close = bookMatchDecision({
      target: {
        title: 'Make: Analog Synthesizers',
        short: 'Make Analog Synthesizers',
        authors: ['Ray Wilson'],
      },
      candidate: {
        title:
          'Make - Analog Synthesizers: Electronic Sounds the Synth-DIY Way',
        authors: ['Ray Wilson'],
      },
      sourceMode: 'metadata',
    });
    const unrelated = bookMatchDecision({
      target: {
        title: 'Make: Analog Synthesizers',
        authors: ['Ray Wilson'],
      },
      candidate: {
        title: 'Make: Woodworking Projects',
        authors: ['Someone Else'],
      },
      sourceMode: 'metadata',
    });

    expect(close.accepted).toBe(true);
    expect(close.reasons).toEqual(
      expect.arrayContaining(['close_title', 'author_support']),
    );
    expect(unrelated.accepted).toBe(false);
  });

  it('does not treat missing ISBNs as ISBN matches', () => {
    const decision = bookMatchDecision({
      target: { title: 'Signals and Systems', isbn: null },
      candidate: { title: 'Completely Different Book', isbn: null },
      sourceMode: 'metadata',
    });

    expect(decision.accepted).toBe(false);
    expect(decision.reasons).not.toContain('isbn_match');
  });

  it('does not treat partial subset titles as exact matches', () => {
    const partial = bookMatchDecision({
      target: {
        title: 'Practical Electronics for Inventors',
        authors: ['Paul Scherz', 'Simon Monk'],
      },
      candidate: {
        title: 'Practical Electronics',
        authors: ['Paul Scherz', 'Simon Monk'],
      },
      sourceMode: 'external_search',
    });
    const expanded = bookMatchDecision({
      target: {
        title: 'Make: Analog Synthesizers',
        authors: ['Ray Wilson'],
      },
      candidate: {
        title:
          'Make - Analog Synthesizers: Electronic Sounds the Synth-DIY Way',
        authors: ['Ray Wilson'],
      },
      sourceMode: 'external_search',
    });

    expect(partial.score).toBeLessThan(0.8);
    expect(partial.reasons).not.toContain('close_title');
    expect(expanded.score).toBeGreaterThanOrEqual(0.8);
    expect(expanded.reasons).toContain('close_title');
  });

  it('requires author support for generic-title conflicts', () => {
    expect(
      genericTitleAuthorConflict(
        { title: 'Make', authors: ['Ray Wilson'] },
        { title: 'Make', authors: ['Someone Else'] },
      ),
    ).toBe(true);
    expect(
      genericTitleAuthorConflict(
        { title: 'Signals and Systems', authors: ['A. Author'] },
        { title: 'Signals and Systems', authors: ['Wrong Author'] },
      ),
    ).toBe(false);
  });

  it('keeps token similarity deterministic', () => {
    expect(jaccardTokenSimilarity('Practical Electronics', 'Electronics')).toBe(
      0.5,
    );
    expect(
      tokenContainmentSimilarity(
        'Practical Electronics for Inventors',
        'Practical Electronics',
      ),
    ).toBe(0.5);
  });
});
