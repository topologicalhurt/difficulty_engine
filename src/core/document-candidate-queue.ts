import { normalizeMatcherText } from './matchers';
import type { BookDocumentCandidateOption } from './types';

export const DOCUMENT_CANDIDATE_QUEUE_LIMIT = 10;

const GENERIC_DOCUMENT_TITLE_PATTERN =
  /\b(?:pdf|ebook|e[-\s]?book|retail|truepdf|epub|mobi|azw3)\b/g;
const DOCUMENT_YEAR_PATTERN = /\b(?:19|20)\d{2}\b/g;

function normalizedCandidateTitleKey(
  title: string | null | undefined,
): string {
  return normalizeMatcherText(title)
    .replace(GENERIC_DOCUMENT_TITLE_PATTERN, ' ')
    .replace(DOCUMENT_YEAR_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function candidateQueuePresentationKey(
  candidate: BookDocumentCandidateOption,
): string {
  const titleKey = normalizedCandidateTitleKey(candidate.title);
  if (titleKey) {
    return [
      candidate.provider,
      candidate.contentKind ?? 'unknown',
      titleKey,
    ].join('|');
  }
  return candidate.greylistKey || candidate.sourceUrl;
}

export function compareQueuedCandidates(
  left: BookDocumentCandidateOption,
  right: BookDocumentCandidateOption,
): number {
  return (
    (right.qualityScore ?? 0) - (left.qualityScore ?? 0) ||
    (right.matchScore ?? 0) - (left.matchScore ?? 0) ||
    (right.seeders ?? right.availability?.seeders ?? 0) -
      (left.seeders ?? left.availability?.seeders ?? 0) ||
    left.title.localeCompare(right.title) ||
    left.id.localeCompare(right.id)
  );
}

export function rankAndLimitCandidateQueue(
  candidates: BookDocumentCandidateOption[],
): BookDocumentCandidateOption[] {
  const byPresentationKey = new Map<string, BookDocumentCandidateOption>();
  [...candidates].sort(compareQueuedCandidates).forEach((candidate) => {
    const key = candidateQueuePresentationKey(candidate);
    if (!key || byPresentationKey.has(key)) return;
    byPresentationKey.set(key, candidate);
  });
  return [...byPresentationKey.values()]
    .sort(compareQueuedCandidates)
    .slice(0, DOCUMENT_CANDIDATE_QUEUE_LIMIT)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}
