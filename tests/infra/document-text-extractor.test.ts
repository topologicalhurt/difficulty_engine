import { describe, expect, it } from 'vitest';

import {
  extractDocumentChapters,
  extractExplicitTocChapters,
  inferChapterHeadersFromText,
} from '../../src/infra/document-text-extractor';
import { TOC_EXTRACTION_PATTERN_SPECS } from '../../src/infra/toc-extraction-patterns';

describe('document text extraction', () => {
  it('prefers PDF outline titles when present', () => {
    const bytes = new TextEncoder().encode(
      '/Title (Contents) /Title (Chapter 1 Signals) /Title (Chapter 2 Systems)',
    );
    const extraction = extractDocumentChapters({
      bytes,
      contentType: 'application/pdf',
      sourceUrl: 'https://example.test/book.pdf',
    });

    expect(extraction?.strategy).toBe('pdf_outline');
    expect(extraction?.chapters).toEqual([
      'Chapter 1 Signals',
      'Chapter 2 Systems',
    ]);
    expect(extraction?.inferred).toBe(false);
    expect(extraction?.attempts?.[0]).toMatchObject({
      strategy: 'pdf_outline',
      accepted: true,
    });
  });

  it('does not let a single PDF metadata title suppress an explicit TOC', () => {
    const bytes = new TextEncoder().encode(
      [
        '/Title (Practical Electronics for Inventors)',
        'Contents',
        'Chapter 1 Direct Current 1',
        'Chapter 2 Alternating Current 31',
        'Chapter 3 Semiconductors 72',
      ].join('\n'),
    );
    const extraction = extractDocumentChapters({
      bytes,
      contentType: 'application/pdf',
      sourceUrl: 'https://example.test/book.pdf',
    });

    expect(extraction?.strategy).toBe('explicit_toc_region');
    expect(extraction?.chapters).toEqual([
      'Chapter 1 Direct Current',
      'Chapter 2 Alternating Current',
      'Chapter 3 Semiconductors',
    ]);
  });

  it('extracts explicit table-of-contents regions before inferred headings', () => {
    const extraction = extractExplicitTocChapters(
      [
        'Preface',
        'Contents',
        'Chapter 1 Foundations 1',
        'Chapter 2 Methods 31',
        'Chapter 3 Applications 72',
        'Chapter 1 Foundations',
      ].join('\n'),
    );

    expect(extraction?.strategy).toBe('explicit_toc_region');
    expect(extraction?.chapters).toEqual([
      'Chapter 1 Foundations',
      'Chapter 2 Methods',
      'Chapter 3 Applications',
    ]);
  });

  it('prefers top-level chapter rows for chapter page ranges', () => {
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
    expect(extraction?.chapterPageRanges).toEqual([
      { start: 1, end: 58 },
      { start: 59, end: 112 },
      { start: 113, end: null },
    ]);
  });

  it('joins split table-of-contents markers with following title lines', () => {
    const extraction = extractExplicitTocChapters(
      [
        'Contents',
        'Chapter 1',
        'Direct Current 1',
        'Chapter Two',
        'Alternating Current 31',
        'Appendix A',
        'Reference Tables 401',
      ].join('\n'),
    );

    expect(extraction?.chapters).toEqual([
      'Chapter 1 Direct Current',
      'Chapter Two Alternating Current',
      'Appendix A Reference Tables',
    ]);
  });

  it('pairs split PDF outline chapter markers with adjacent title siblings', () => {
    const bytes = new TextEncoder().encode(
      [
        '/Title (Contents)',
        '/Title (Index)',
        '/Title (CHAPTER 3)',
        '/Title (Linear Maps)',
        '/Title (CHAPTER 2)',
        '/Title (Finite-Dimensional Vector Spaces)',
        '/Title (CHAPTER 1)',
        '/Title (Vector Spaces)',
      ].join(' '),
    );
    const extraction = extractDocumentChapters({
      bytes,
      contentType: 'application/pdf',
      sourceUrl: 'https://example.test/book.pdf',
    });

    expect(extraction?.strategy).toBe('pdf_outline');
    expect(extraction?.chapters).toEqual([
      'CHAPTER 1 Vector Spaces',
      'CHAPTER 2 Finite-Dimensional Vector Spaces',
      'CHAPTER 3 Linear Maps',
    ]);
  });

  it('does not accept PDF object or binary stream noise as inferred chapters', () => {
    const extraction = extractDocumentChapters({
      bytes: new TextEncoder().encode(
        [
          '%PDF-1.4',
          '1 0 obj',
          '0000000015 00000 n',
          '0000000920 00000 n',
          '/Width 1041',
          '/Height 177',
          'stream',
          '2 0 obj',
          '3 0 obj',
          'endstream',
        ].join('\n'),
      ),
      contentType: 'application/pdf',
      sourceUrl: 'https://example.test/book.pdf',
    });

    expect(extraction).toBeNull();
  });

  it('rejects front matter dominated outlines without real chapter evidence', () => {
    const bytes = new TextEncoder().encode(
      [
        '/Title (Quantum Calculus and Functional Analysis with Applications)',
        '/Title (Cover)',
        '/Title (Index)',
        '/Title (Half Title)',
        '/Title (A Proofs of Theorems, Lemmas, and Conjectures)',
      ].join(' '),
    );

    expect(
      extractDocumentChapters({
        bytes,
        contentType: 'application/pdf',
        sourceUrl: 'https://example.test/book.pdf',
      }),
    ).toBeNull();
  });

  it('joins wrapped table-of-contents title continuations', () => {
    const extraction = extractExplicitTocChapters(
      [
        'Contents',
        'Chapter 1 Introduction to Electronics 1',
        'Chapter 2 Basic Electronic Circuit',
        'Components 253',
        'Chapter 3 Semiconductors 311',
      ].join('\n'),
    );

    expect(extraction?.chapters).toEqual([
      'Chapter 1 Introduction to Electronics',
      'Chapter 2 Basic Electronic Circuit Components',
      'Chapter 3 Semiconductors',
    ]);
  });

  it('decodes PDF outline titles stored as hex strings', () => {
    const bytes = new TextEncoder().encode(
      [
        '/Title <436f6e74656e7473>',
        '/Title <4368617074657220312046696c74657273>',
        '/Title <436861707465722032204f7363696c6c61746f7273>',
      ].join(' '),
    );
    const extraction = extractDocumentChapters({
      bytes,
      contentType: 'application/pdf',
      sourceUrl: 'https://example.test/book.pdf',
    });

    expect(extraction?.strategy).toBe('pdf_outline');
    expect(extraction?.chapters).toEqual([
      'Chapter 1 Filters',
      'Chapter 2 Oscillators',
    ]);
  });

  it('keeps long multi-page TOCs while stopping before body chapter headings', () => {
    const extraction = extractExplicitTocChapters(
      [
        'CONTENTS',
        'CHAPTER 1 Introduction to Electronics 1',
        'filler line',
        'CHAPTER 2 Theory 5',
        ...Array.from(
          { length: 120 },
          (_, index) => `Contents continuation ${index}`,
        ),
        'CHAPTER 16 Audio Electronics 947',
        'CHAPTER 17 Modular Electronics 963',
        ...Array.from({ length: 30 }, (_, index) => `appendix filler ${index}`),
        'CHAPTER 1',
        'Introduction to Electronics',
      ].join('\n'),
    );

    expect(extraction?.strategy).toBe('explicit_toc_region');
    expect(extraction?.chapters).toEqual(
      expect.arrayContaining([
        'CHAPTER 1 Introduction to Electronics',
        'CHAPTER 16 Audio Electronics',
        'CHAPTER 17 Modular Electronics',
      ]),
    );
    expect(extraction?.chapters).not.toContain('CHAPTER 1');
  });

  it('preserves TOC page starts as chapter page ranges', () => {
    const extraction = extractExplicitTocChapters(`
      Contents
      Chapter 1 Signals and Systems .......... 1
      Chapter 2 Filters ..................... 47
      Appendix A Reference Tables .......... 209
      Index ................................ 240
    `);

    expect(extraction?.chapters).toEqual([
      'Chapter 1 Signals and Systems',
      'Chapter 2 Filters',
      'Appendix A Reference Tables',
      'Index',
    ]);
    expect(extraction?.chapterPageRanges).toEqual([
      { start: 1, end: 46 },
      { start: 47, end: 208 },
      { start: 209, end: 239 },
      { start: 240, end: null },
    ]);
    expect(extraction?.pageRangeTrustStatus).toBe('trusted');
    expect(extraction?.trustedChapterPageRangeCount).toBe(4);
  });

  it('quarantines sparse page suffixes as estimates instead of planner ranges', () => {
    const extraction = extractExplicitTocChapters(`
      Contents
      Chapter 1 Signals and Systems .......... 1
      Chapter 2 Filters ..................... 47
      Chapter 3 Sampling
      Chapter 4 Transforms
      Chapter 5 Applications
    `);

    expect(extraction?.chapters).toHaveLength(5);
    expect(extraction?.chapterPageRanges).toBeUndefined();
    expect(extraction?.estimatedChapterPageRanges?.[0]).toEqual({
      start: 1,
      end: 46,
    });
    expect(extraction?.pageRangeTrustStatus).toBe('estimated');
  });

  it('trusts two monotonic anchors for short TOCs', () => {
    const extraction = extractExplicitTocChapters(`
      Contents
      Chapter 1 Signals and Systems .......... 1
      Chapter 2 Filters ..................... 47
      Chapter 3 Applications
    `);

    expect(extraction?.chapters).toHaveLength(3);
    expect(extraction?.chapterPageRanges).toEqual([
      { start: 1, end: 46 },
      { start: 47, end: null },
      null,
    ]);
    expect(extraction?.pageRangeTrustStatus).toBe('trusted');
  });

  it('quarantines nonmonotonic page suffixes as conflicting ranges', () => {
    const extraction = extractExplicitTocChapters(`
      Contents
      Chapter 1 Signals and Systems .......... 100
      Chapter 2 Filters ..................... 47
      Chapter 3 Applications ................ 140
    `);

    expect(extraction?.chapters).toHaveLength(3);
    expect(extraction?.chapterPageRanges).toBeUndefined();
    expect(extraction?.pageRangeTrustStatus).toBe('conflict');
    expect(extraction?.chapterPageRangeTrust).toEqual([
      'conflict',
      'conflict',
      'conflict',
    ]);
  });

  it('uses PDF outline destination anchors as trusted page ranges', () => {
    const bytes = new TextEncoder().encode(
      '/Title (Contents) /Title (Chapter 1 Signals) /Title (Chapter 2 Systems) /Title (Chapter 3 Filters)',
    );
    const extraction = extractDocumentChapters({
      bytes,
      contentType: 'application/pdf',
      sourceUrl: 'https://example.test/book.pdf',
      pageAnchors: [
        {
          chapterTitle: 'Chapter 1 Signals',
          sourceMethod: 'pdf_outline_destination',
          confidence: 0.92,
          physicalPage: 11,
        },
        {
          chapterTitle: 'Chapter 2 Systems',
          sourceMethod: 'pdf_outline_destination',
          confidence: 0.92,
          physicalPage: 39,
        },
        {
          chapterTitle: 'Chapter 3 Filters',
          sourceMethod: 'pdf_outline_destination',
          confidence: 0.92,
          physicalPage: 84,
        },
      ],
    });

    expect(extraction?.strategy).toBe('pdf_outline');
    expect(extraction?.chapterPageRanges).toEqual([
      { start: 11, end: 38 },
      { start: 39, end: 83 },
      { start: 84, end: null },
    ]);
  });

  it('filters structured PDF outline anchors to chapter-level entries', () => {
    const extraction = extractDocumentChapters({
      contentType: 'application/pdf',
      sourceUrl: 'https://example.test/book.pdf',
      pageAnchors: [
        {
          chapterTitle: 'Part I Foundations',
          sourceMethod: 'pdf_outline_destination',
          confidence: 0.92,
          physicalPage: 1,
          outlineLevel: 1,
        },
        {
          chapterTitle: 'Chapter 1 Signals',
          sourceMethod: 'pdf_outline_destination',
          confidence: 0.92,
          physicalPage: 11,
          outlineLevel: 2,
        },
        {
          chapterTitle: '1.1 Notation',
          sourceMethod: 'pdf_outline_destination',
          confidence: 0.92,
          physicalPage: 12,
          outlineLevel: 3,
        },
        {
          chapterTitle: 'Chapter 2 Systems',
          sourceMethod: 'pdf_outline_destination',
          confidence: 0.92,
          physicalPage: 39,
          outlineLevel: 2,
        },
      ],
    });

    expect(extraction?.strategy).toBe('pdf_outline');
    expect(extraction?.chapters).toEqual([
      'Chapter 1 Signals',
      'Chapter 2 Systems',
    ]);
    expect(extraction?.chapterPageRanges).toEqual([
      { start: 11, end: 38 },
      { start: 39, end: null },
    ]);
    expect(extraction?.attempts?.[0]?.sourceKind).toBe('pdf_structure');
  });

  it('uses conservative inferred headers only with repeated structural evidence', () => {
    const extraction = inferChapterHeadersFromText(
      [
        'Chapter 1 Foundations',
        'some paragraph text that should not matter',
        'Chapter 2 Operators',
        'more paragraph text',
        'Chapter 3 Spectra',
      ].join('\n'),
    );

    expect(extraction?.strategy).toBe('inferred_headers');
    expect(extraction?.confidence).toBeLessThan(0.5);
    expect(extraction?.chapters).toEqual([
      'Chapter 1 Foundations',
      'Chapter 2 Operators',
      'Chapter 3 Spectra',
    ]);
  });

  it('requires inferred structural headers to form a coherent sequence', () => {
    const extraction = inferChapterHeadersFromText(
      [
        'Chapter 9 Later Material',
        'Chapter 2 Earlier Material',
        'Chapter 7 Middle Material',
      ].join('\n'),
    );

    expect(extraction).toBeNull();
  });

  it('rejects descriptive summaries and one-off headings as inferred TOCs', () => {
    const extraction = extractDocumentChapters({
      text: [
        'This textbook provides a comprehensive introduction and explains how readers can learn the subject.',
        'Chapter 1 Foundations',
        'The author covers many topics in a clear pedagogical arc.',
        'References',
      ].join('\n'),
      contentType: 'text/plain',
    });

    expect(extraction).toBeNull();
  });

  it('registers TOC extraction patterns with documented intent', () => {
    expect(TOC_EXTRACTION_PATTERN_SPECS.length).toBeGreaterThan(3);
    expect(
      TOC_EXTRACTION_PATTERN_SPECS.every(
        (spec) =>
          spec.id &&
          spec.purpose &&
          ((spec.accepts?.length ?? 0) > 0 || (spec.rejects?.length ?? 0) > 0),
      ),
    ).toBe(true);
  });
});
