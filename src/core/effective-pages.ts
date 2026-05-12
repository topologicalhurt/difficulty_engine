import { classifyReadingSections } from './section-classifier';
import { readingScopeSettingsForProject } from './reading-scope';
import type {
  BookRecord,
  EffectiveReadingPages,
  PlannerProjectV1,
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
    confidence: round2(
      clamp(
        skippedSections.reduce(
          (total, section) => total + section.confidence,
          0,
        ) / Math.max(1, skippedSections.length),
        0,
        1,
      ),
    ),
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
