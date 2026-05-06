import { sanitizeChapterTitles } from '../core/chapter-titles';
import type { BookEnrichment, BookRecord } from '../core/types';
import type { StrategyCandidate } from './toc-merge';

function chapterSourcePriority(candidate: StrategyCandidate): number {
  const source = candidate.tocSource;
  if (source === 'manual') return 100;
  if (source === 'pdf') return 90;
  if (source === 'internet_archive') return 80;
  if (source === 'openlibrary') return 70;
  if (source === 'google_books') return 50;
  if (source === 'search') return 40;
  if (candidate.provider === 'manual') return 60;
  return 0;
}

function reliableChapterCount(candidate: StrategyCandidate): number {
  return candidate.chapters?.filter(Boolean).length ?? 0;
}

function chapterCandidateScore(candidate: StrategyCandidate): number {
  const count = reliableChapterCount(candidate);
  const countScore = Math.min(24, Math.log2(count + 1) * 6);
  const inferredPenalty = candidate.inferred ? 8 : 0;
  return (
    chapterSourcePriority(candidate) +
    candidate.confidence * 12 +
    countScore -
    inferredPenalty
  );
}

export function bestChapterCandidate(
  candidates: StrategyCandidate[],
): StrategyCandidate | undefined {
  return [...candidates]
    .filter((candidate) => candidate.chapters?.length)
    .sort((left, right) => {
      const manualDelta =
        Number(right.tocSource === 'manual') -
        Number(left.tocSource === 'manual');
      if (manualDelta !== 0) return manualDelta;
      const scoreDelta =
        chapterCandidateScore(right) - chapterCandidateScore(left);
      if (Math.abs(scoreDelta) > 0.0001) return scoreDelta;
      const confidenceDelta = right.confidence - left.confidence;
      if (confidenceDelta !== 0) return confidenceDelta;
      const countDelta =
        reliableChapterCount(right) - reliableChapterCount(left);
      if (countDelta !== 0) return countDelta;
      return (
        left.provider.localeCompare(right.provider) ||
        left.sourceUrl.localeCompare(right.sourceUrl)
      );
    })[0];
}

export function preferredTocSource(
  current: BookEnrichment['tocSource'],
  candidates: StrategyCandidate[],
): BookEnrichment['tocSource'] {
  const winner = bestChapterCandidate(candidates);
  return winner?.tocSource ?? current;
}

export function existingChapterCandidate(
  book: BookRecord,
): StrategyCandidate | null {
  const chapters = sanitizeChapterTitles(book.enrichment.chapters, {
    source: book.enrichment.tocSource === 'manual' ? 'manual' : 'imported',
  });
  if (!chapters.length) return null;
  return {
    provider:
      book.enrichment.tocSource === 'manual' ? 'manual' : 'local_document',
    sourceUrl: 'local://current-enrichment',
    confidence: book.enrichment.tocSource === 'manual' ? 1 : 0.54,
    chapters,
    tocSource: book.enrichment.tocSource,
    strategy: 'existing_chapters',
    inferred: book.enrichment.provenance?.chapters?.inferred,
    evidenceAnchors: book.enrichment.provenance?.chapters?.evidenceAnchors,
  };
}
