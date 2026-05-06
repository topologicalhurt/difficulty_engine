import { isLikelyChapterTitle } from '../core/chapter-titles';
import {
  BARE_NUMBER_MARKER_PATTERN,
  DECIMAL_HEADER_PATTERN,
  MARKER_ONLY_CHAPTER_PATTERN,
  NUMBERED_HEADER_PATTERN,
  PDF_OBJECT_NOISE_PATTERN,
  TOC_CONTINUATION_START_PATTERN,
  CONTENTS_LINE_PATTERN,
} from './toc-extraction-patterns';

export const DOCUMENT_TEXT_SCAN_CHARS = 260_000;

const HEADER_MAX_LENGTH = 110;
const RICHER_MARKER_PATTERN =
  /^(chapter|ch\.?|part|book|unit|section|appendix|lecture|lesson|module)\s+(\d+|[ivxlcdm]+|[a-z]|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b.+/i;

export function normalizeDocumentLines(text: string): string[] {
  return text
    .slice(0, DOCUMENT_TEXT_SCAN_CHARS)
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 2 && line.length <= HEADER_MAX_LENGTH)
    .filter((line) => !PDF_OBJECT_NOISE_PATTERN.test(line));
}

function markerKey(title: string): string | null {
  const match = title.match(MARKER_ONLY_CHAPTER_PATTERN);
  return match ? `${match[1]?.toLowerCase()}:${match[2]?.toLowerCase()}` : null;
}

function richerMarkerKey(title: string): string | null {
  const match = title.match(RICHER_MARKER_PATTERN);
  return match ? `${match[1]?.toLowerCase()}:${match[2]?.toLowerCase()}` : null;
}

export function removeMarkerOnlyDuplicates(chapters: string[]): string[] {
  const richerKeys = new Set(
    chapters.map(richerMarkerKey).filter((key): key is string => Boolean(key)),
  );
  return chapters.filter((chapter) => {
    const key = markerKey(chapter);
    return !key || !richerKeys.has(key);
  });
}

export function joinSplitTocLines(lines: string[]): string[] {
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
