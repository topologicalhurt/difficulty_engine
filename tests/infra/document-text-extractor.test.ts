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
    expect(extraction?.chapters).toEqual(['Contents', 'Chapter 1 Signals', 'Chapter 2 Systems']);
    expect(extraction?.inferred).toBe(false);
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

  it('keeps long multi-page TOCs while stopping before body chapter headings', () => {
    const extraction = extractExplicitTocChapters(
      [
        'CONTENTS',
        'CHAPTER 1 Introduction to Electronics 1',
        'filler line',
        'CHAPTER 2 Theory 5',
        ...Array.from({ length: 120 }, (_, index) => `Contents continuation ${index}`),
        'CHAPTER 16 Audio Electronics 947',
        'CHAPTER 17 Modular Electronics 963',
        ...Array.from({ length: 30 }, (_, index) => `appendix filler ${index}`),
        'CHAPTER 1',
        'Introduction to Electronics',
      ].join('\n'),
    );

    expect(extraction?.strategy).toBe('explicit_toc_region');
    expect(extraction?.chapters).toEqual(expect.arrayContaining([
      'CHAPTER 1 Introduction to Electronics',
      'CHAPTER 16 Audio Electronics',
      'CHAPTER 17 Modular Electronics',
    ]));
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
