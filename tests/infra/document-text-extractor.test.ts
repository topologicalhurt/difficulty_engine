import { describe, expect, it } from 'vitest';

import {
  extractDocumentChapters,
  extractExplicitTocChapters,
  inferChapterHeadersFromText,
} from '../../src/infra/document-text-extractor';

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
      'Contents',
      'Chapter 1 Signals',
      'Chapter 2 Systems',
    ]);
    expect(extraction?.inferred).toBe(false);
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
      'Contents',
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
      'Contents',
      'Chapter 1 Foundations',
      'Chapter 2 Methods',
      'Chapter 3 Applications',
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
      'Contents',
      'Chapter 1 Direct Current',
      'Chapter Two Alternating Current',
      'Appendix A Reference Tables',
    ]);
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
      'Contents',
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
      'Contents',
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
});
