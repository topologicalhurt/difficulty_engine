import type { PageAnchorEvidence } from './toc-page-ranges';

export const MIN_PDF_OUTLINE_CHAPTERS = 2;

const PDF_OUTLINE_CHAPTER_LIKE_PATTERN =
  /^(?:chapter|ch\.?|unit|module|lecture|lesson)\b|^\d{1,3}[.)]?\s+\S/i;
const PDF_OUTLINE_MAJOR_PATTERN =
  /^(?:chapter|ch\.?|part|book|unit|module|lecture|lesson|appendix)\b|^\d{1,3}[.)]?\s+\S/i;
const PDF_OUTLINE_FRONT_BACK_PATTERN =
  /^(?:advertisements?|contents?|table of contents|preface|foreword|acknowledg|cover|half title|title page|copyright|references?|bibliography|index|glossary)\b/i;

function outlineLevel(anchor: PageAnchorEvidence): number | null {
  return Number.isFinite(anchor.outlineLevel) && (anchor.outlineLevel ?? 0) > 0
    ? Math.round(anchor.outlineLevel ?? 0)
    : null;
}

function isMajorOutlineAnchor(anchor: PageAnchorEvidence): boolean {
  return (
    PDF_OUTLINE_MAJOR_PATTERN.test(anchor.chapterTitle) &&
    !PDF_OUTLINE_FRONT_BACK_PATTERN.test(anchor.chapterTitle)
  );
}

function outlineAnchorKey(anchor: PageAnchorEvidence): string {
  return [
    anchor.chapterTitle.toLowerCase().trim(),
    outlineLevel(anchor) ?? '',
    anchor.physicalPage ?? '',
    anchor.printedPage ?? '',
  ].join('::');
}

export function preferredPdfOutlineAnchors(
  pageAnchors: PageAnchorEvidence[] = [],
): PageAnchorEvidence[] {
  const outlineAnchors = pageAnchors.filter(
    (anchor) => anchor.sourceMethod === 'pdf_outline_destination',
  );
  if (!outlineAnchors.some((anchor) => outlineLevel(anchor) != null)) {
    return outlineAnchors;
  }
  const nonFrontOutlineAnchors = outlineAnchors.filter(
    (anchor) => !PDF_OUTLINE_FRONT_BACK_PATTERN.test(anchor.chapterTitle),
  );
  const majorAnchors = outlineAnchors.filter(isMajorOutlineAnchor);
  const chapterLikeAnchors = majorAnchors.filter((anchor) =>
    PDF_OUTLINE_CHAPTER_LIKE_PATTERN.test(anchor.chapterTitle),
  );
  const levelSource =
    chapterLikeAnchors.length >= MIN_PDF_OUTLINE_CHAPTERS
      ? chapterLikeAnchors
      : majorAnchors.length >= MIN_PDF_OUTLINE_CHAPTERS
        ? majorAnchors
        : nonFrontOutlineAnchors;
  const levels = levelSource
    .map(outlineLevel)
    .filter((level): level is number => level != null);
  if (!levels.length) return nonFrontOutlineAnchors;
  const preferredLevel = Math.min(...levels);
  const preferred =
    majorAnchors.length >= MIN_PDF_OUTLINE_CHAPTERS
      ? majorAnchors
      : nonFrontOutlineAnchors;
  return preferred.filter((anchor) => outlineLevel(anchor) === preferredLevel);
}

export function topicPdfOutlineAnchors(
  pageAnchors: PageAnchorEvidence[] = [],
  chapterAnchors: PageAnchorEvidence[] = preferredPdfOutlineAnchors(pageAnchors),
): PageAnchorEvidence[] {
  const chapterLevels = chapterAnchors
    .map(outlineLevel)
    .filter((level): level is number => level != null);
  if (!chapterLevels.length) return [];
  const chapterLevel = Math.min(...chapterLevels);
  const chapterKeys = new Set(chapterAnchors.map(outlineAnchorKey));
  return pageAnchors.filter((anchor) => {
    if (anchor.sourceMethod !== 'pdf_outline_destination') return false;
    if (PDF_OUTLINE_FRONT_BACK_PATTERN.test(anchor.chapterTitle)) return false;
    if (chapterKeys.has(outlineAnchorKey(anchor))) return false;
    const level = outlineLevel(anchor);
    return level != null && level > chapterLevel;
  });
}
