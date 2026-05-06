import {
  extractChapterCandidatesFromText,
  isLikelyChapterTitle,
  sanitizeChapterTitles,
} from '../core/chapter-titles';
import { isPdfDocument } from './qbittorrent-file-kinds';
import { decodePdfBytes, extractPdfOutlineTitles } from './pdf-outline-titles';
import {
  BARE_NUMBER_MARKER_PATTERN,
  BODY_CHAPTER_START_PATTERN,
  CONTENTS_LINE_PATTERN,
  DECIMAL_HEADER_PATTERN,
  EXPLICIT_CONTENTS_PATTERN,
  FRONT_BACK_LINE_PATTERN,
  MARKER_ONLY_CHAPTER_PATTERN,
  NUMBERED_HEADER_PATTERN,
  PAGE_HEADER_PATTERN,
  PDF_OBJECT_NOISE_PATTERN,
  TOC_CONTINUATION_START_PATTERN,
} from './toc-extraction-patterns';

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

const TEXT_SCAN_CHARS = 260_000;
const CONTENTS_REGION_MAX_LINES = 900;
const EARLY_TEXT_LINES = 260;
const MIN_EXPLICIT_TOC_CHAPTERS = 2;
const MIN_PDF_OUTLINE_CHAPTERS = 2;
const MIN_INFERRED_HEADER_COUNT = 3;
const MAX_INFERRED_HEADER_COUNT = 80;
const HEADER_MAX_LENGTH = 110;

function decodeBytes(bytes: Uint8Array): string {
  return decodePdfBytes(bytes).slice(0, TEXT_SCAN_CHARS);
}

function normalizeLines(text: string): string[] {
  return text
    .slice(0, TEXT_SCAN_CHARS)
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 2 && line.length <= HEADER_MAX_LENGTH)
    .filter((line) => !PDF_OBJECT_NOISE_PATTERN.test(line));
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

function markerKey(title: string): string | null {
  const match = title.match(MARKER_ONLY_CHAPTER_PATTERN);
  return match ? `${match[1]?.toLowerCase()}:${match[2]?.toLowerCase()}` : null;
}

function richerMarkerKey(title: string): string | null {
  const match = title.match(
    /^(chapter|ch\.?|part|book|unit|section|appendix|lecture|lesson|module)\s+(\d+|[ivxlcdm]+|[a-z]|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b.+/i,
  );
  return match ? `${match[1]?.toLowerCase()}:${match[2]?.toLowerCase()}` : null;
}

function removeMarkerOnlyDuplicates(chapters: string[]): string[] {
  const richerKeys = new Set(
    chapters.map(richerMarkerKey).filter((key): key is string => Boolean(key)),
  );
  return chapters.filter((chapter) => {
    const key = markerKey(chapter);
    return !key || !richerKeys.has(key);
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

function joinSplitTocLines(lines: string[]): string[] {
  const joined: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const next = lines[index + 1] ?? '';
    if (
      next &&
      (MARKER_ONLY_CHAPTER_PATTERN.test(line) ||
        BARE_NUMBER_MARKER_PATTERN.test(line)) &&
      isLikelyChapterTitle(next, 'structured')
    ) {
      joined.push(`${line} ${next}`);
      index += 1;
      continue;
    }
    if (
      next &&
      (NUMBERED_HEADER_PATTERN.test(line) ||
        DECIMAL_HEADER_PATTERN.test(line)) &&
      !NUMBERED_HEADER_PATTERN.test(next) &&
      !DECIMAL_HEADER_PATTERN.test(next) &&
      !CONTENTS_LINE_PATTERN.test(next) &&
      TOC_CONTINUATION_START_PATTERN.test(next) &&
      isLikelyChapterTitle(next, 'structured')
    ) {
      joined.push(`${line} ${next}`);
      index += 1;
      continue;
    }
    joined.push(line);
  }
  return joined;
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
  const lines = normalizeLines(text);
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
  const lines = normalizeLines(text);
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
