export interface TocExtractionPatternSpec {
  id: string;
  pattern: RegExp;
  purpose: string;
  accepts?: string[];
  rejects?: string[];
}

export const PDF_OBJECT_NOISE_PATTERN =
  /(?:^%|^startxref\b|^(?:\d+\s+){1,2}obj\b|^\d{5,}\s+\d{5}\s+[nf]\b|^\d+\s+\d+\s+R\b|^\d+\/[A-Za-z0-9]+|^\[?\/[A-Za-z0-9]+|^endobj\b|^xref\b|^trailer\b|^stream\b|^endstream\b|<<|>>|\/(?:DCTDecode|DecodeParms|FontWeight|Length|OutputIntents|ViewerPreferences)\b|[\u00b6\ufffd]|[A-Z]:[\\/].+\.(?:eps|pdf|png|jpe?g|tiff?)\b)/i;
export const CONTROL_HEAVY_LINE_PATTERN = new RegExp(
  String.raw`[\u0000-\u0008\u000b-\u001f\u007f-\u009f]`,
);
export const CONTENTS_LINE_PATTERN = /^(?:table of )?contents$/i;
export const EXPLICIT_CONTENTS_PATTERN = /\b(?:table of contents|contents)\b/i;
export const BODY_CHAPTER_START_PATTERN =
  /^(?:chapter|ch\.?|part|book|unit|section|appendix|lecture|lesson|module)\s+(?:\d+|[ivxlcdm]+|[a-z]|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*$/i;
export const MARKER_ONLY_CHAPTER_PATTERN =
  /^(chapter|ch\.?|part|book|unit|section|appendix|lecture|lesson|module)\s+(\d+|[ivxlcdm]+|[a-z]|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)$/i;
export const NUMBERED_HEADER_PATTERN =
  /^(?:chapter|ch\.?|part|book|unit|section|appendix|lecture|lesson|module)\s+(?:\d+|[ivxlcdm]+|[a-z]|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i;
export const DECIMAL_HEADER_PATTERN =
  /^\d{1,2}(?:\.\d{1,2}){0,2}\s+[\p{Lu}\p{N}][^.!?]{2,}$/u;
export const BARE_NUMBER_MARKER_PATTERN = /^(?:\d{1,2}|[ivxlcdm]{1,8})[.)]?$/i;
export const TOC_CONTINUATION_START_PATTERN =
  /^[\p{Lu}\d][\p{L}\p{N}',:&() -]{2,100}$/u;
export const PAGE_HEADER_PATTERN =
  /^\s*(?:\d{1,4}\s+)?([A-Z][\p{L}\p{N}',:&() -]{3,100})\s*(?:\d{1,4})?\s*$/u;
export const FRONT_BACK_LINE_PATTERN =
  /^(?:index|references|bibliography|copyright|isbn|all rights reserved)\b/i;

export const TOC_EXTRACTION_PATTERN_SPECS: TocExtractionPatternSpec[] = [
  {
    id: 'contents_line',
    pattern: CONTENTS_LINE_PATTERN,
    purpose: 'Locate an explicit TOC heading before accepting provider text.',
    accepts: ['Contents', 'Table of Contents'],
  },
  {
    id: 'marker_only_chapter',
    pattern: MARKER_ONLY_CHAPTER_PATTERN,
    purpose: 'Join split marker/title rows such as “Chapter 1” + title.',
    accepts: ['Chapter 1', 'Appendix A'],
  },
  {
    id: 'numbered_header',
    pattern: NUMBERED_HEADER_PATTERN,
    purpose: 'Recognize repeated body-style chapter headings.',
    accepts: ['Chapter 1 Filters', 'Lecture 7 Stability'],
  },
  {
    id: 'decimal_header',
    pattern: DECIMAL_HEADER_PATTERN,
    purpose: 'Recognize decimal section headers only with title text.',
    accepts: ['3.1 Metric Spaces'],
    rejects: ['3.1'],
  },
  {
    id: 'pdf_object_noise',
    pattern: PDF_OBJECT_NOISE_PATTERN,
    purpose: 'Reject raw PDF object and binary stream fragments.',
    rejects: [
      '1 0 obj',
      '0000000015 00000 n',
      '9036 0 R/Lang(en-US)',
      '/Width 1041',
      'stream',
    ],
  },
  {
    id: 'front_back_line',
    pattern: FRONT_BACK_LINE_PATTERN,
    purpose: 'Reject metadata/back-matter lines during inferred extraction.',
    rejects: ['ISBN 9781234567897', 'References'],
  },
];
