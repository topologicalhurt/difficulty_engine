import type { ChapterPageRange } from '../core/types';

export type ChapterPageRangeTrust =
  | 'trusted'
  | 'estimated'
  | 'missing'
  | 'conflict';

export type PageAnchorSourceMethod =
  | 'pdf_outline_destination'
  | 'toc_link'
  | 'toc_text_suffix'
  | 'embedded_text'
  | 'ocr_tsv'
  | 'provider_metadata';

export interface PageAnchorEvidence {
  chapterTitle: string;
  sourceMethod: PageAnchorSourceMethod;
  confidence: number;
  physicalPage?: number;
  printedPage?: string;
  bbox?: { x: number; y: number; width: number; height: number };
  conflicts?: string[];
}

export interface ChapterPageRangeReconciliation {
  trustedRanges?: Array<ChapterPageRange | null>;
  estimatedRanges?: Array<ChapterPageRange | null>;
  trust: ChapterPageRangeTrust[];
  status: ChapterPageRangeTrust;
  trustedCount: number;
  anchoredCount: number;
  rejectedReasons: string[];
}

function chapterKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(?:chapter|ch|part|book|unit|section|appendix|lecture|lesson|module)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function numericPrintedPage(value: string | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  return /^\d{1,5}$/.test(trimmed) ? Number(trimmed) : null;
}

function anchorStart(anchor: PageAnchorEvidence | undefined): number | null {
  if (!anchor) return null;
  if (anchor.physicalPage != null && anchor.physicalPage > 0) {
    return Math.round(anchor.physicalPage);
  }
  return numericPrintedPage(anchor.printedPage);
}

function monotonicStarts(ranges: Array<ChapterPageRange | null>): boolean {
  let previous = 0;
  for (const range of ranges) {
    if (!range?.start) continue;
    if (range.start <= previous) return false;
    previous = range.start;
  }
  return true;
}

function rangesFromStarts(starts: Array<number | null>): Array<ChapterPageRange | null> {
  return starts.map((start, index) => {
    if (!start || start < 1) return null;
    const nextStart = starts
      .slice(index + 1)
      .find((candidate): candidate is number => candidate != null && candidate > start);
    return {
      start,
      end: nextStart ? nextStart - 1 : null,
    };
  });
}

export function pageAnchorsFromStarts(
  entries: Array<{ title: string; pageStart?: number }>,
  sourceMethod: PageAnchorSourceMethod,
  confidence: number,
): PageAnchorEvidence[] {
  return entries
    .filter((entry) => entry.pageStart != null && entry.pageStart > 0)
    .map((entry) => ({
      chapterTitle: entry.title,
      sourceMethod,
      confidence,
      printedPage: String(entry.pageStart),
    }));
}

export function rangesFromPageAnchors(
  chapters: string[],
  anchors: PageAnchorEvidence[] = [],
): Array<ChapterPageRange | null> | undefined {
  if (!chapters.length || !anchors.length) return undefined;
  const byChapterKey = new Map<string, PageAnchorEvidence[]>();
  anchors.forEach((anchor) => {
    const key = chapterKey(anchor.chapterTitle);
    if (!key) return;
    const bucket = byChapterKey.get(key) ?? [];
    bucket.push(anchor);
    byChapterKey.set(key, bucket);
  });
  const starts = chapters.map((chapter) => {
    const key = chapterKey(chapter);
    const anchor = [...(byChapterKey.get(key) ?? [])].sort(
      (left, right) => right.confidence - left.confidence,
    )[0];
    return anchorStart(anchor);
  });
  return starts.some((start) => start != null) ? rangesFromStarts(starts) : undefined;
}

export function reconcileChapterPageRanges(
  chapters: string[],
  ranges?: Array<ChapterPageRange | null>,
): ChapterPageRangeReconciliation {
  const emptyTrust = chapters.map(() => 'missing' as const);
  if (!chapters.length || !ranges?.some((range) => range?.start)) {
    return {
      trust: emptyTrust,
      status: 'missing',
      trustedCount: 0,
      anchoredCount: 0,
      rejectedReasons: ['no_page_anchors'],
    };
  }
  const normalizedRanges = chapters.map((_, index) => ranges[index] ?? null);
  const anchoredCount = normalizedRanges.filter((range) => range?.start).length;
  if (!monotonicStarts(normalizedRanges)) {
    return {
      estimatedRanges: normalizedRanges,
      trust: chapters.map((_, index) =>
        normalizedRanges[index]?.start ? 'conflict' : 'missing',
      ),
      status: 'conflict',
      trustedCount: 0,
      anchoredCount,
      rejectedReasons: ['non_monotonic_page_anchors'],
    };
  }
  const minAnchors =
    chapters.length <= 1 ? 1 : chapters.length <= 3 ? 2 : 3;
  const coverage = anchoredCount / Math.max(1, chapters.length);
  const trusted = anchoredCount >= minAnchors && (coverage >= 0.7 || anchoredCount >= 3);
  if (!trusted) {
    return {
      estimatedRanges: normalizedRanges,
      trust: chapters.map((_, index) =>
        normalizedRanges[index]?.start ? 'estimated' : 'missing',
      ),
      status: 'estimated',
      trustedCount: 0,
      anchoredCount,
      rejectedReasons: ['insufficient_page_anchor_coverage'],
    };
  }
  return {
    trustedRanges: normalizedRanges,
    estimatedRanges: normalizedRanges,
    trust: chapters.map((_, index) =>
      normalizedRanges[index]?.start ? 'trusted' : 'missing',
    ),
    status: 'trusted',
    trustedCount: anchoredCount,
    anchoredCount,
    rejectedReasons: [],
  };
}
