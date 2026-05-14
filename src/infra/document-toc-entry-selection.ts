import type { ChapterTitleEntry } from '../core/chapter-titles';

const MIN_TOC_ENTRY_SELECTION_COUNT = 2;
const DECIMAL_SECTION_ENTRY_PATTERN = /^\d{1,3}\.\d+(?:\.\d+)*\s+\S/;
const TOP_LEVEL_NUMBERED_ENTRY_PATTERN =
  /^\d{1,3}[.)]?\s+(?!\d)(?![ivxlcdm]+\b)\S/i;

function topLevelSequenceValue(title: string): number | null {
  const match = title.match(TOP_LEVEL_NUMBERED_ENTRY_PATTERN);
  if (!match) return null;
  const value = title.match(/^(\d{1,3})/)?.[1];
  return value ? Number(value) : null;
}

export function topicLevelTocEntries(
  entries: ChapterTitleEntry[],
  chapterEntries: ChapterTitleEntry[],
): ChapterTitleEntry[] {
  const chapterTitles = new Set(chapterEntries.map((entry) => entry.title));
  return entries.filter(
    (entry) =>
      !chapterTitles.has(entry.title) &&
      DECIMAL_SECTION_ENTRY_PATTERN.test(entry.title),
  );
}

export function preferChapterLevelTocEntries(
  entries: ChapterTitleEntry[],
  isTopLevelHeader: (title: string) => boolean,
  hasConsistentChapterSequence: (chapters: string[]) => boolean,
): ChapterTitleEntry[] {
  const decimalSectionCount = entries.filter((entry) =>
    DECIMAL_SECTION_ENTRY_PATTERN.test(entry.title),
  ).length;
  if (decimalSectionCount < MIN_TOC_ENTRY_SELECTION_COUNT) return entries;
  const topLevel = entries.filter(
    (entry) =>
      TOP_LEVEL_NUMBERED_ENTRY_PATTERN.test(entry.title) ||
      isTopLevelHeader(entry.title),
  );
  const sequenceValues = topLevel
    .map((entry) => topLevelSequenceValue(entry.title))
    .filter((value): value is number => value != null);
  if (
    topLevel.length >= MIN_TOC_ENTRY_SELECTION_COUNT &&
    sequenceValues[0] === 1 &&
    hasConsistentChapterSequence(topLevel.map((entry) => entry.title))
  ) {
    return topLevel;
  }
  return entries.length > decimalSectionCount * 0.75 ? [] : entries;
}
