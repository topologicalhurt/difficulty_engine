import { describe, expect, it } from 'vitest';

import {
  extractDocumentChapters,
  extractExplicitTocChapters,
} from '../../src/infra/document-text-extractor';

describe('document text extraction hardening', () => {
  it('rejects table-of-contents markers that never gain title content', () => {
    const extraction = extractExplicitTocChapters(
      ['Contents', 'CHAPTER 1', 'CHAPTER 2', 'CHAPTER 3', 'CHAPTER 4'].join(
        '\n',
      ),
    );

    expect(extraction).toBeNull();
  });

  it('pairs split structured outline anchors before chapter selection', () => {
    const extraction = extractDocumentChapters({
      contentType: 'application/pdf',
      sourceUrl: 'https://example.test/book.pdf',
      pageAnchors: [
        {
          chapterTitle: 'CHAPTER 1',
          sourceMethod: 'pdf_outline_destination',
          confidence: 0.94,
          physicalPage: 12,
          outlineLevel: 1,
        },
        {
          chapterTitle: 'Vector Spaces',
          sourceMethod: 'pdf_outline_destination',
          confidence: 0.9,
          physicalPage: 12,
          outlineLevel: 1,
        },
        {
          chapterTitle: 'CHAPTER 2',
          sourceMethod: 'pdf_outline_destination',
          confidence: 0.94,
          physicalPage: 48,
          outlineLevel: 1,
        },
        {
          chapterTitle: 'Linear Maps',
          sourceMethod: 'pdf_outline_destination',
          confidence: 0.9,
          physicalPage: 48,
          outlineLevel: 1,
        },
      ],
    });

    expect(extraction?.strategy).toBe('pdf_outline');
    expect(extraction?.chapters).toEqual([
      'CHAPTER 1 Vector Spaces',
      'CHAPTER 2 Linear Maps',
    ]);
    expect(extraction?.chapterPageRanges).toEqual([
      { start: 12, end: 47 },
      { start: 48, end: null },
    ]);
  });

  it('keeps title-row page anchors when pairing split outline markers', () => {
    const extraction = extractDocumentChapters({
      contentType: 'application/pdf',
      sourceUrl: 'https://example.test/book.pdf',
      pageAnchors: [
        {
          chapterTitle: 'CHAPTER 1',
          sourceMethod: 'pdf_outline_destination',
          confidence: 0.94,
          outlineLevel: 1,
        },
        {
          chapterTitle: 'Vector Spaces',
          sourceMethod: 'pdf_outline_destination',
          confidence: 0.9,
          physicalPage: 12,
          outlineLevel: 1,
        },
        {
          chapterTitle: 'CHAPTER 2',
          sourceMethod: 'pdf_outline_destination',
          confidence: 0.94,
          outlineLevel: 1,
        },
        {
          chapterTitle: 'Linear Maps',
          sourceMethod: 'pdf_outline_destination',
          confidence: 0.9,
          physicalPage: 48,
          outlineLevel: 1,
        },
      ],
    });

    expect(extraction?.chapters).toEqual([
      'CHAPTER 1 Vector Spaces',
      'CHAPTER 2 Linear Maps',
    ]);
    expect(extraction?.chapterPageRanges).toEqual([
      { start: 12, end: 47 },
      { start: 48, end: null },
    ]);
  });

  it('does not pair split outline markers with conflicting destinations', () => {
    const extraction = extractDocumentChapters({
      contentType: 'application/pdf',
      sourceUrl: 'https://example.test/book.pdf',
      pageAnchors: [
        {
          chapterTitle: 'CHAPTER 1',
          sourceMethod: 'pdf_outline_destination',
          confidence: 0.94,
          physicalPage: 10,
          outlineLevel: 1,
        },
        {
          chapterTitle: 'Vector Spaces',
          sourceMethod: 'pdf_outline_destination',
          confidence: 0.9,
          physicalPage: 12,
          outlineLevel: 1,
        },
      ],
    });

    expect(extraction).toBeNull();
  });

  it('does not treat raw PDF xref/resource dictionaries as explicit TOCs', () => {
    const extraction = extractDocumentChapters({
      bytes: new TextEncoder().encode(
        [
          '%PDF-1.7',
          'Contents',
          'startxref',
          '0000000015 00000 n',
          '9036 0 R/Lang(en-US)/ViewerPreferences >>',
          '[/DCTDecode]/DecodeParms[null]/Length 8011>>',
          '0/FontWeight 700/Ascent 728/Descent -210',
          'År°bl1¶',
          '28392 0 R>>',
        ].join('\n'),
      ),
      contentType: 'application/pdf',
      sourceUrl: 'https://example.test/book.pdf',
    });

    expect(extraction).toBeNull();
  });
});
