import { isLikelyChapterTitle } from '../core/chapter-titles';
import { STRUCTURAL_MARKER_ONLY_PATTERN } from '../core/chapter-title-patterns';
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

function shouldPairSplitOutlineAnchor(
  marker: PageAnchorEvidence,
  title: PageAnchorEvidence | undefined,
): title is PageAnchorEvidence {
  if (!STRUCTURAL_MARKER_ONLY_PATTERN.test(marker.chapterTitle)) return false;
  if (!title) return false;
  if (title.sourceMethod !== marker.sourceMethod) return false;
  if (STRUCTURAL_MARKER_ONLY_PATTERN.test(title.chapterTitle)) return false;
  if (PDF_OUTLINE_FRONT_BACK_PATTERN.test(title.chapterTitle)) return false;
  const markerLevel = outlineLevel(marker);
  const titleLevel = outlineLevel(title);
  if (markerLevel != null && titleLevel != null && titleLevel !== markerLevel) {
    return false;
  }
  if (
    marker.physicalPage != null &&
    title.physicalPage != null &&
    marker.physicalPage !== title.physicalPage
  ) {
    return false;
  }
  if (
    marker.printedPage != null &&
    title.printedPage != null &&
    marker.printedPage !== title.printedPage
  ) {
    return false;
  }
  return isLikelyChapterTitle(title.chapterTitle, 'structured');
}

function pairSplitOutlineAnchors(
  anchors: PageAnchorEvidence[],
): PageAnchorEvidence[] {
  const paired: PageAnchorEvidence[] = [];
  for (let index = 0; index < anchors.length; index += 1) {
    const anchor = anchors[index];
    if (!anchor) continue;
    const next = anchors[index + 1];
    if (shouldPairSplitOutlineAnchor(anchor, next)) {
      paired.push({
        ...anchor,
        chapterTitle: `${anchor.chapterTitle} ${next.chapterTitle}`,
        physicalPage: anchor.physicalPage ?? next.physicalPage,
        printedPage: anchor.printedPage ?? next.printedPage,
        bbox: anchor.bbox ?? next.bbox,
        confidence: Math.min(anchor.confidence, next.confidence),
        conflicts: [...(anchor.conflicts ?? []), ...(next.conflicts ?? [])],
      });
      index += 1;
      continue;
    }
    paired.push(anchor);
  }
  return paired;
}

function pdfOutlineAnchors(
  pageAnchors: PageAnchorEvidence[],
): PageAnchorEvidence[] {
  return pairSplitOutlineAnchors(
    pageAnchors.filter(
      (anchor) => anchor.sourceMethod === 'pdf_outline_destination',
    ),
  );
}

export function preferredPdfOutlineAnchors(
  pageAnchors: PageAnchorEvidence[] = [],
): PageAnchorEvidence[] {
  const outlineAnchors = pdfOutlineAnchors(pageAnchors);
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
  chapterAnchors: PageAnchorEvidence[] = preferredPdfOutlineAnchors(
    pageAnchors,
  ),
): PageAnchorEvidence[] {
  const chapterLevels = chapterAnchors
    .map(outlineLevel)
    .filter((level): level is number => level != null);
  if (!chapterLevels.length) return [];
  const chapterLevel = Math.min(...chapterLevels);
  const chapterKeys = new Set(chapterAnchors.map(outlineAnchorKey));
  return pdfOutlineAnchors(pageAnchors).filter((anchor) => {
    if (PDF_OUTLINE_FRONT_BACK_PATTERN.test(anchor.chapterTitle)) return false;
    if (chapterKeys.has(outlineAnchorKey(anchor))) return false;
    const level = outlineLevel(anchor);
    return level != null && level > chapterLevel;
  });
}
