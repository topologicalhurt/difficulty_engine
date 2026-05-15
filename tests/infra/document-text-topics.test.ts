import { describe, expect, it } from 'vitest';

import {
  extractDocumentChapters,
  extractExplicitTocChapters,
} from '../../src/infra/document-text-extractor';

describe('document text topic extraction', () => {
  it('keeps dense decimal subsection rows as topics beside chapters', () => {
    const extraction = extractExplicitTocChapters(
      [
        'Contents',
        '1 Vector Analysis 1',
        '1.1 Vector Algebra 1',
        '1.1.1 Vector Operations 1',
        '1.2 Differential Calculus 13',
        '2 Electrostatics 59',
        '2.1 The Electric Field 59',
        '2.2 Divergence and Curl 66',
        '3 Potentials 113',
        '3.1 Laplace Equation 113',
      ].join('\n'),
    );

    expect(extraction?.chapters).toEqual([
      '1 Vector Analysis',
      '2 Electrostatics',
      '3 Potentials',
    ]);
    expect(extraction?.topics).toEqual([
      '1.1 Vector Algebra',
      '1.1.1 Vector Operations',
      '1.2 Differential Calculus',
      '2.1 The Electric Field',
      '2.2 Divergence and Curl',
      '3.1 Laplace Equation',
    ]);
  });

  it('keeps subsection-only explicit TOCs as topics, not chapters', () => {
    const extraction = extractExplicitTocChapters(
      [
        'Contents',
        '1.1 Vector Algebra 1',
        '1.1.1 Vector Operations 1',
        '1.2 Differential Calculus 13',
        '2.1 The Electric Field 59',
        '2.2 Divergence and Curl 66',
        '3.1 Laplace Equation 113',
      ].join('\n'),
    );

    expect(extraction?.chapters).toEqual([]);
    expect(extraction?.topics).toEqual([
      '1.1 Vector Algebra',
      '1.1.1 Vector Operations',
      '1.2 Differential Calculus',
      '2.1 The Electric Field',
      '2.2 Divergence and Curl',
      '3.1 Laplace Equation',
    ]);
  });

  it('combines outline chapters with explicit section topics', () => {
    const extraction = extractDocumentChapters({
      bytes: new TextEncoder().encode(
        [
          'Contents',
          '1 Vector Analysis 1',
          '1.1 Vector Algebra 1',
          '1.2 Differential Calculus 13',
          '2 Electrostatics 59',
          '2.1 The Electric Field 59',
        ].join('\n'),
      ),
      contentType: 'application/pdf',
      sourceUrl: 'https://example.test/book.pdf',
      pageAnchors: [
        {
          chapterTitle: '1. Vector Analysis',
          sourceMethod: 'pdf_outline_destination',
          confidence: 0.92,
          physicalPage: 20,
          outlineLevel: 1,
        },
        {
          chapterTitle: '2. Electrostatics',
          sourceMethod: 'pdf_outline_destination',
          confidence: 0.92,
          physicalPage: 78,
          outlineLevel: 1,
        },
      ],
    });

    expect(extraction?.chapters).toEqual([
      '1. Vector Analysis',
      '2. Electrostatics',
    ]);
    expect(extraction?.topics).toEqual([
      '1.1 Vector Algebra',
      '1.2 Differential Calculus',
      '2.1 The Electric Field',
    ]);
  });

  it('keeps lower-level outline bookmarks as topics without TOC text', () => {
    const extraction = extractDocumentChapters({
      contentType: 'application/pdf',
      sourceUrl: 'https://example.test/book.pdf',
      pageAnchors: [
        {
          chapterTitle: '1. Vector Analysis',
          sourceMethod: 'pdf_outline_destination',
          confidence: 0.92,
          physicalPage: 20,
          outlineLevel: 1,
        },
        {
          chapterTitle: '1.1 Vector Algebra',
          sourceMethod: 'pdf_outline_destination',
          confidence: 0.9,
          physicalPage: 21,
          outlineLevel: 2,
        },
        {
          chapterTitle: '1.2 Differential Calculus',
          sourceMethod: 'pdf_outline_destination',
          confidence: 0.9,
          physicalPage: 34,
          outlineLevel: 2,
        },
        {
          chapterTitle: '2. Electrostatics',
          sourceMethod: 'pdf_outline_destination',
          confidence: 0.92,
          physicalPage: 78,
          outlineLevel: 1,
        },
        {
          chapterTitle: '2.1 The Electric Field',
          sourceMethod: 'pdf_outline_destination',
          confidence: 0.9,
          physicalPage: 79,
          outlineLevel: 2,
        },
      ],
    });

    expect(extraction?.chapters).toEqual([
      '1. Vector Analysis',
      '2. Electrostatics',
    ]);
    expect(extraction?.topics).toEqual([
      '1.1 Vector Algebra',
      '1.2 Differential Calculus',
      '2.1 The Electric Field',
    ]);
    expect(extraction?.topicPageRanges).toEqual([
      { start: 21, end: 33 },
      { start: 34, end: 78 },
      { start: 79, end: null },
    ]);
  });

  it('does not re-include front matter when outline chapters are unnumbered', () => {
    const extraction = extractDocumentChapters({
      contentType: 'application/pdf',
      sourceUrl: 'https://example.test/book.pdf',
      pageAnchors: [
        {
          chapterTitle: 'Advertisement',
          sourceMethod: 'pdf_outline_destination',
          confidence: 0.92,
          physicalPage: 2,
          outlineLevel: 1,
        },
        {
          chapterTitle: 'Vector Analysis',
          sourceMethod: 'pdf_outline_destination',
          confidence: 0.92,
          physicalPage: 11,
          outlineLevel: 1,
        },
        {
          chapterTitle: 'Electrostatics',
          sourceMethod: 'pdf_outline_destination',
          confidence: 0.92,
          physicalPage: 67,
          outlineLevel: 1,
        },
      ],
    });

    expect(extraction?.strategy).toBe('pdf_outline');
    expect(extraction?.chapters).toEqual(['Vector Analysis', 'Electrostatics']);
    expect(extraction?.chapterPageRanges).toEqual([
      { start: 11, end: 66 },
      { start: 67, end: null },
    ]);
  });
});
