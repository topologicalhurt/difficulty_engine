import {
  extractChapterCandidatesFromText,
  isLikelyChapterTitle,
  sanitizeChapterTitles,
} from '../core/chapter-titles';
import { isPdfDocument } from './qbittorrent-file-kinds';
import { decodePdfBytes, extractPdfOutlineTitles } from './pdf-outline-titles';
import {
  BODY_CHAPTER_START_PATTERN,
  CONTENTS_LINE_PATTERN,
  DECIMAL_HEADER_PATTERN,
  EXPLICIT_CONTENTS_PATTERN,
  FRONT_BACK_LINE_PATTERN,
  NUMBERED_HEADER_PATTERN,
  PAGE_HEADER_PATTERN,
} from './toc-extraction-patterns';
import {
  DOCUMENT_TEXT_SCAN_CHARS,
  joinSplitTocLines,
  normalizeDocumentLines,
  removeMarkerOnlyDuplicates,
} from './toc-line-normalization';

export type DocumentExtractionStrategy =
  | 'pdf_outline'
  | 'explicit_toc_region'
  | 'inferred_headers';

export interface DocumentChapterExtraction {
  chapters: string[];
  strategy: DocumentExtractionStrategy;
  confidence: number;
  evidenceAnchors: string[];
  inferred: boolean;
}

const CONTENTS_REGION_MAX_LINES = 900;
const EARLY_TEXT_LINES = 260;
const MIN_EXPLICIT_TOC_CHAPTERS = 2;
const MIN_PDF_OUTLINE_CHAPTERS = 2;
const MIN_INFERRED_HEADER_COUNT = 3;
const MAX_INFERRED_HEADER_COUNT = 80;

function decodeBytes(bytes: Uint8Array): string {
  return decodePdfBytes(bytes).slice(0, DOCUMENT_TEXT_SCAN_CHARS);
}

function extraction(
  chapters: string[],
  strategy: DocumentExtractionStrategy,
  confidence: number,
  evidenceAnchors: string[],
): DocumentChapterExtraction | null {
  if (!chapters.length) return null;
  return {
    chapters,
    strategy,
    confidence,
    evidenceAnchors: evidenceAnchors.slice(0, 8),
    inferred: strategy === 'inferred_headers',
  };
}

function explicitTocRegion(lines: string[], contentsIndex: number): string[] {
  const region: string[] = [];
  let structuralEntries = 0;
  for (
    let index = contentsIndex;
    index < Math.min(lines.length, contentsIndex + CONTENTS_REGION_MAX_LINES);
    index += 1
  ) {
    const line = lines[index] ?? '';
    if (
      region.length > 24 &&
      structuralEntries >= MIN_EXPLICIT_TOC_CHAPTERS &&
      BODY_CHAPTER_START_PATTERN.test(line)
    ) {
      break;
    }
    region.push(line);
    if (
      NUMBERED_HEADER_PATTERN.test(line) ||
      DECIMAL_HEADER_PATTERN.test(line)
    ) {
      structuralEntries += 1;
    }
  }
  return region;
}

export function extractPdfOutlineChapters(
  bytes: Uint8Array,
): DocumentChapterExtraction | null {
  const titles = extractPdfOutlineTitles(bytes);
  const chapters = removeMarkerOnlyDuplicates(
    sanitizeChapterTitles(titles, { source: 'structured', limit: 80 }),
  );
  if (chapters.length < MIN_PDF_OUTLINE_CHAPTERS) return null;
  return extraction(chapters, 'pdf_outline', 0.72, titles);
}

export function extractExplicitTocChapters(
  text: string,
): DocumentChapterExtraction | null {
  const lines = normalizeDocumentLines(text);
  const contentsIndex = lines.findIndex((line) =>
    CONTENTS_LINE_PATTERN.test(line),
  );
  const regionLines =
    contentsIndex >= 0
      ? explicitTocRegion(lines, contentsIndex)
      : lines.slice(0, EARLY_TEXT_LINES);
  const joinedRegionLines = joinSplitTocLines(regionLines);
  const region = joinedRegionLines.join('\n');
  if (contentsIndex < 0 && !EXPLICIT_CONTENTS_PATTERN.test(region)) {
    return null;
  }
  const chapters = removeMarkerOnlyDuplicates(
    extractChapterCandidatesFromText(region, {
      source: 'structured',
      limit: 80,
    }),
  );
  if (chapters.length < MIN_EXPLICIT_TOC_CHAPTERS) {
    return null;
  }
  return extraction(
    chapters,
    'explicit_toc_region',
    0.64,
    joinedRegionLines.slice(0, 16),
  );
}

function isInferredHeader(line: string): boolean {
  if (FRONT_BACK_LINE_PATTERN.test(line)) return false;
  if (NUMBERED_HEADER_PATTERN.test(line) || DECIMAL_HEADER_PATTERN.test(line)) {
    return isLikelyChapterTitle(line, 'structured');
  }
  const pageHeaderMatch = line.match(PAGE_HEADER_PATTERN);
  if (!pageHeaderMatch) return false;
  const title = pageHeaderMatch[1] ?? line;
  const words = title.split(/\s+/).filter(Boolean);
  const titleCaseWords = words.filter((word) => /^[A-Z0-9]/.test(word));
  return (
    words.length >= 2 &&
    words.length <= 9 &&
    titleCaseWords.length / words.length >= 0.75
  );
}

export function inferChapterHeadersFromText(
  text: string,
): DocumentChapterExtraction | null {
  const lines = normalizeDocumentLines(text);
  const candidates = lines
    .filter(isInferredHeader)
    .filter((line, index, all) => all.indexOf(line) === index);
  const chapters = removeMarkerOnlyDuplicates(
    sanitizeChapterTitles(candidates, {
      source: 'structured',
      limit: MAX_INFERRED_HEADER_COUNT,
    }),
  );
  if (chapters.length < MIN_INFERRED_HEADER_COUNT) {
    return null;
  }
  const markerCount = chapters.filter(
    (title) =>
      NUMBERED_HEADER_PATTERN.test(title) || DECIMAL_HEADER_PATTERN.test(title),
  ).length;
  if (markerCount < Math.min(MIN_INFERRED_HEADER_COUNT, chapters.length)) {
    return null;
  }
  return extraction(chapters, 'inferred_headers', 0.42, candidates);
}

export function extractDocumentChapters(input: {
  bytes?: Uint8Array;
  text?: string;
  contentType?: string;
  sourceUrl?: string;
}): DocumentChapterExtraction | null {
  const isPdf = Boolean(
    input.bytes && isPdfDocument(input.sourceUrl, input.contentType),
  );
  const text = input.text ?? (input.bytes ? decodeBytes(input.bytes) : '');
  if (isPdf && input.bytes) {
    const outline = extractPdfOutlineChapters(input.bytes);
    if (outline) return outline;
  }
  return extractExplicitTocChapters(text) ?? inferChapterHeadersFromText(text);
}
