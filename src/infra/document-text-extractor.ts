import {
  extractChapterEntriesFromText,
  isLikelyChapterTitle,
  sanitizeChapterTitles,
  type ChapterTitleEntry,
} from '../core/chapter-titles';
import type { ChapterPageRange } from '../core/types';
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
  chapterPageRanges?: Array<ChapterPageRange | null>;
  strategy: DocumentExtractionStrategy;
  confidence: number;
  evidenceAnchors: string[];
  inferred: boolean;
  attempts?: TocExtractionAttempt[];
}

export interface TocExtractionAttempt {
  strategy: DocumentExtractionStrategy;
  sourceKind: 'pdf_raw_outline' | 'pdf_raw_text' | 'document_text';
  confidence: number;
  chapters: string[];
  chapterPageRanges?: Array<ChapterPageRange | null>;
  accepted: boolean;
  rejectedReasons: string[];
  evidenceAnchors: string[];
  pageRange?: { start: number; end: number };
  durationMs: number;
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
  attempts: TocExtractionAttempt[] = [],
  chapterPageRanges?: Array<ChapterPageRange | null>,
): DocumentChapterExtraction | null {
  if (!chapters.length) return null;
  return {
    chapters,
    chapterPageRanges,
    strategy,
    confidence,
    evidenceAnchors: evidenceAnchors.slice(0, 8),
    inferred: strategy === 'inferred_headers',
    attempts,
  };
}

function elapsedMs(start: number): number {
  return Math.max(0, Math.round(performance.now() - start));
}

function attempt(
  strategy: DocumentExtractionStrategy,
  sourceKind: TocExtractionAttempt['sourceKind'],
  start: number,
  result: DocumentChapterExtraction | null,
  rejectedReasons: string[],
): TocExtractionAttempt {
  return {
    strategy,
    sourceKind,
    confidence: result?.confidence ?? 0,
    chapters: result?.chapters ?? [],
    chapterPageRanges: result?.chapterPageRanges,
    accepted: Boolean(result),
    rejectedReasons,
    evidenceAnchors: result?.evidenceAnchors ?? [],
    durationMs: elapsedMs(start),
  };
}

function pageRangesFromEntries(
  entries: ChapterTitleEntry[],
): Array<ChapterPageRange | null> {
  return entries.map((entry, index) => {
    const pageStart = entry.pageStart;
    if (!pageStart || pageStart < 1) return null;
    const nextStart = entries
      .slice(index + 1)
      .map((candidate) => candidate.pageStart)
      .find(
        (candidateStart): candidateStart is number =>
          candidateStart != null && candidateStart > pageStart,
      );
    return {
      start: pageStart,
      end: nextStart ? nextStart - 1 : null,
    };
  });
}

function entriesForChapters(
  entries: ChapterTitleEntry[],
  chapters: string[],
): ChapterTitleEntry[] {
  const remaining = [...entries];
  return chapters.map((chapter) => {
    const index = remaining.findIndex((entry) => entry.title === chapter);
    if (index < 0) return { title: chapter };
    const [entry] = remaining.splice(index, 1);
    return entry ?? { title: chapter };
  });
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
  const entries = extractChapterEntriesFromText(region, {
    source: 'structured',
    limit: 80,
  });
  const chapters = removeMarkerOnlyDuplicates(
    entries.map((entry) => entry.title),
  );
  if (chapters.length < MIN_EXPLICIT_TOC_CHAPTERS) {
    return null;
  }
  const chapterEntries = entriesForChapters(entries, chapters);
  return extraction(
    chapters,
    'explicit_toc_region',
    0.64,
    joinedRegionLines.slice(0, 16),
    [],
    pageRangesFromEntries(chapterEntries),
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
  if (!hasConsistentChapterSequence(chapters)) {
    return null;
  }
  return extraction(chapters, 'inferred_headers', 0.42, candidates);
}

function chapterSequenceValue(title: string): number | null {
  const chapter = title.match(
    /^(?:chapter|ch\.?)\s+(\d+|[ivxlcdm]+)\b/i,
  );
  if (chapter) {
    const raw = (chapter[1] ?? '').toLowerCase();
    if (/^\d+$/.test(raw)) return Number(raw);
    const romanValues: Record<string, number> = {
      i: 1,
      v: 5,
      x: 10,
      l: 50,
      c: 100,
      d: 500,
      m: 1000,
    };
    return Array.from(raw).reduce((total, char, index, chars) => {
      const current = romanValues[char] ?? 0;
      const next = romanValues[chars[index + 1] ?? ''] ?? 0;
      return total + (current < next ? -current : current);
    }, 0);
  }
  const decimal = title.match(/^(\d{1,3})(?:\.\d+)*[.)]?\s+/);
  return decimal ? Number(decimal[1]) : null;
}

function hasConsistentChapterSequence(chapters: string[]): boolean {
  const values = chapters
    .map(chapterSequenceValue)
    .filter((value): value is number => value != null && value > 0);
  if (values.length < MIN_INFERRED_HEADER_COUNT) return false;
  let orderedPairs = 0;
  for (let index = 1; index < values.length; index += 1) {
    if ((values[index] ?? 0) >= (values[index - 1] ?? 0)) orderedPairs += 1;
  }
  return orderedPairs >= Math.max(2, values.length - 2);
}

export function extractDocumentChapterAttempts(input: {
  bytes?: Uint8Array;
  text?: string;
  contentType?: string;
  sourceUrl?: string;
}): TocExtractionAttempt[] {
  const attempts: TocExtractionAttempt[] = [];
  const isPdf = Boolean(
    input.bytes && isPdfDocument(input.sourceUrl, input.contentType),
  );
  const text = input.text ?? (input.bytes ? decodeBytes(input.bytes) : '');
  if (isPdf && input.bytes) {
    const start = performance.now();
    attempts.push(
      attempt(
        'pdf_outline',
        'pdf_raw_outline',
        start,
        extractPdfOutlineChapters(input.bytes),
        ['no_usable_pdf_outline'],
      ),
    );
  }
  const explicitStart = performance.now();
  attempts.push(
    attempt(
      'explicit_toc_region',
      isPdf ? 'pdf_raw_text' : 'document_text',
      explicitStart,
      extractExplicitTocChapters(text),
      ['no_explicit_toc_region'],
    ),
  );
  const inferredStart = performance.now();
  attempts.push(
    attempt(
      'inferred_headers',
      isPdf ? 'pdf_raw_text' : 'document_text',
      inferredStart,
      inferChapterHeadersFromText(text),
      ['insufficient_repeated_structural_headers'],
    ),
  );
  return attempts;
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
    if (outline) {
      outline.attempts = extractDocumentChapterAttempts(input);
      return outline;
    }
  }
  const extractionResult =
    extractExplicitTocChapters(text) ?? inferChapterHeadersFromText(text);
  if (extractionResult) {
    extractionResult.attempts = extractDocumentChapterAttempts(input);
  }
  return extractionResult;
}
