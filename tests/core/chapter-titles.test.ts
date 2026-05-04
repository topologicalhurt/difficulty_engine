import { describe, expect, it } from 'vitest';

import {
  extractChapterCandidatesFromText,
  sanitizeChapterTitles,
} from '../../src/core/chapter-titles';

describe('chapter title detection', () => {
  it('accepts common structural chapter naming schemes', () => {
    expect(
      sanitizeChapterTitles([
        'Chapter 1 Signals',
        'Ch. 2: Systems',
        '3. Fourier Series',
        '3.1 Metric Spaces',
        'IV. Integration',
        'Part II Applications',
        'Appendix A Measure Theory',
        'Lecture 7: Stability',
        'Module 4 - State Space',
        'Foreword',
        'Further Reading',
        'Limits of continuous functions',
      ], { source: 'structured' }),
    ).toEqual([
      'Chapter 1 Signals',
      'Ch. 2: Systems',
      '3. Fourier Series',
      '3.1 Metric Spaces',
      'IV. Integration',
      'Part II Applications',
      'Appendix A Measure Theory',
      'Lecture 7: Stability',
      'Module 4 - State Space',
      'Foreword',
      'Further Reading',
      'Limits of continuous functions',
    ]);
  });

  it('rejects narrative and marketing text even when it is short', () => {
    expect(
      sanitizeChapterTitles([
        'This hands-on guide outlines electrical principles',
        'Open Library work description',
        'Students learn how to build prototypes',
        'Spark your creativity and gain electronics skills',
        'Chapter 1 Foundations',
      ], { source: 'imported' }),
    ).toEqual(['Chapter 1 Foundations']);
  });

  it('requires structural evidence when extracting from unstructured descriptions', () => {
    const text = [
      'A comprehensive introduction to modern analysis for graduate students.',
      'Chapter 1 Foundations. Chapter 2 Functions. Appendix A Symbols.',
      'This book provides many examples and exercises.',
    ].join(' ');

    expect(extractChapterCandidatesFromText(text, { source: 'unstructured' })).toEqual([
      'Chapter 1 Foundations',
      'Chapter 2 Functions',
      'Appendix A Symbols',
    ]);
  });

  it('strips table-of-contents dot leaders and page numbers', () => {
    expect(
      sanitizeChapterTitles([
        '1. Functions and Limits ........ 13',
        'Chapter 2 Differentiation ...... 48',
        '3 Linear Maps 51',
        'Preface vii',
        '1.1',
      ], { source: 'structured' }),
    ).toEqual([
      '1. Functions and Limits',
      'Chapter 2 Differentiation',
      '3 Linear Maps',
      'Preface',
    ]);
  });
});
