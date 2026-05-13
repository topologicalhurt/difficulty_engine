import { classifyReadingSections } from './section-classifier';
import { readingScopeSettingsForProject } from './reading-scope';
import type {
  BookRecord,
  ChapterPageRange,
  EffectiveReadingPages,
  PlannerProjectV1,
  ReadingSectionDecision,
  ReadingScopeSettings,
} from './types';
import { clamp, round1, round2 } from './utils';

const TRUSTED_TOC_SOURCES = new Set([
  'manual',
  'pdf',
  'internet_archive',
]);

function trustedSectionPages(book: BookRecord): boolean {
  return (
    TRUSTED_TOC_SOURCES.has(book.enrichment.tocSource) &&
    book.enrichment.chapters.length >= 4
  );
}

interface ResolvedSectionRange {
  start: number;
  end: number;
}

function pageRangeForSection(
  ranges: Array<ChapterPageRange | null> | undefined,
  index: number,
  physicalPages: number,
): ResolvedSectionRange | null {
  const range = ranges?.[index];
  if (!range?.start || range.start > physicalPages) return null;
  const nextStart = ranges
    ?.slice(index + 1)
    .map((candidate) => candidate?.start)
    .find((start): start is number => start != null && start > range.start);
  const rawEnd = range.end ?? (nextStart ? nextStart - 1 : physicalPages);
  const start = Math.max(1, Math.min(physicalPages, Math.round(range.start)));
  const end = Math.max(start, Math.min(physicalPages, Math.round(rawEnd)));
  return { start, end };
}

function rangePageCount(range: ResolvedSectionRange): number {
  return Math.max(0, range.end - range.start + 1);
}

function mergeRanges(ranges: ResolvedSectionRange[]): ResolvedSectionRange[] {
  const sorted = [...ranges].sort(
    (left, right) => left.start - right.start || left.end - right.end,
  );
  const merged: ResolvedSectionRange[] = [];
  sorted.forEach((range) => {
    const previous = merged.at(-1);
    if (!previous || range.start > previous.end + 1) {
      merged.push({ ...range });
      return;
    }
    previous.end = Math.max(previous.end, range.end);
  });
  return merged;
}

function averageConfidence(sections: ReadingSectionDecision[]): number {
  return round2(
    clamp(
      sections.reduce((total, section) => total + section.confidence, 0) /
        Math.max(1, sections.length),
      0,
      1,
    ),
  );
}

function rangeBackedSkippedPages(
  sections: ReadingSectionDecision[],
  skippedSections: ReadingSectionDecision[],
  physicalPages: number,
): {
  skippedPages: number;
  skippedSections: ReadingSectionDecision[];
  rangedCount: number;
  unrangedCount: number;
} | null {
  const ranges = sections.map((section) => section.pageRange ?? null);
  if (!ranges.some((range) => range?.start)) return null;
  const annotated = skippedSections.map((section) => {
    const range = pageRangeForSection(ranges, section.index, physicalPages);
    return {
      section,
      range,
      estimatedPages: range ? rangePageCount(range) : 0,
    };
  });
  const merged = mergeRanges(
    annotated
      .map((entry) => entry.range)
      .filter((range): range is ResolvedSectionRange => Boolean(range)),
  );
  return {
    skippedPages: Math.round(
      clamp(
        merged.reduce((total, range) => total + rangePageCount(range), 0),
        0,
        Math.max(0, physicalPages - 1),
      ),
    ),
    skippedSections: annotated.map(({ section, range, estimatedPages }) => ({
      ...section,
      pageRange: range ?? section.pageRange,
      estimatedPages,
    })),
    rangedCount: annotated.filter((entry) => entry.range).length,
    unrangedCount: annotated.filter((entry) => !entry.range).length,
  };
}

export function effectiveReadingPagesForBook(
  book: BookRecord,
  settings: ReadingScopeSettings,
): EffectiveReadingPages {
  const physicalPages = Math.max(1, Math.round(book.pages || 1));
  const sections = classifyReadingSections(book, settings);
  const skippedSections = sections.filter((section) => section.skipped);
  if (!sections.length || !skippedSections.length) {
    return {
      physicalPages,
      effectivePages: physicalPages,
      skippedPages: 0,
      skippedSections,
      confidence: sections.length ? 0.5 : 0,
      bindingReason: sections.length
        ? null
        : 'No learned sections are available for reading-scope decisions.',
    };
  }
  if (!trustedSectionPages(book)) {
    return {
      physicalPages,
      effectivePages: physicalPages,
      skippedPages: 0,
      skippedSections,
      confidence: 0.3,
      bindingReason:
        'Section titles were classified, but page savings are not trusted without a manual/PDF/Archive TOC.',
    };
  }

  const rangeBacked = rangeBackedSkippedPages(
    sections,
    skippedSections,
    physicalPages,
  );
  if (rangeBacked) {
    const effectivePages = Math.max(1, physicalPages - rangeBacked.skippedPages);
    return {
      physicalPages,
      effectivePages,
      skippedPages: rangeBacked.skippedPages,
      skippedSections: rangeBacked.skippedSections,
      confidence: averageConfidence(skippedSections),
      bindingReason: rangeBacked.skippedPages
        ? `Skipped ${round1(rangeBacked.skippedPages)} page-ranged non-core page(s) from ${rangeBacked.rangedCount} learned section(s).${rangeBacked.unrangedCount ? ` ${rangeBacked.unrangedCount} skipped section(s) had no page range.` : ''}`
        : 'Skipped sections were identified, but their page ranges could not reduce workload.',
    };
  }

  const averageSectionPages = physicalPages / Math.max(1, sections.length);
  const rawSkippedPages = skippedSections.reduce(
    (total, section) =>
      total + averageSectionPages * clamp(section.confidence, 0.35, 1),
    0,
  );
  const skippedPages = Math.round(
    clamp(rawSkippedPages, 0, Math.max(0, physicalPages * 0.3)),
  );
  const effectivePages = Math.max(1, physicalPages - skippedPages);
  return {
    physicalPages,
    effectivePages,
    skippedPages,
    skippedSections,
    confidence: averageConfidence(skippedSections),
    bindingReason: skippedPages
      ? `Skipped ${round1(skippedPages)} estimated non-core page(s) from ${skippedSections.length} learned section(s).`
      : null,
  };
}

export function effectiveReadingPagesById(
  project: PlannerProjectV1,
): Record<string, EffectiveReadingPages> {
  return Object.fromEntries(
    Object.entries(project.library.books).map(([id, book]) => [
      id,
      effectiveReadingPagesForBook(book, readingScopeSettingsForProject(project)),
    ]),
  );
}
