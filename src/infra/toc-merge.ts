import { sanitizeChapterEntries, sanitizeChapterTitles } from '../core/chapter-titles';
import type { ChapterTitleEntry } from '../core/chapter-titles';
import type {
  BookEnrichment,
  BookRecord,
  ChapterPageRange,
  EnrichmentFieldProvenance,
} from '../core/types';
import { compactItems, uniqueCompactStrings } from '../core/utils';
import {
  bestChapterCandidate,
  existingChapterCandidate,
} from './toc-candidate-ranking';
import { isoTimestamp } from './cache-time';
import type {
  ChapterPageRangeTrust,
  PageAnchorEvidence,
} from './toc-page-ranges';

export interface StrategyCandidate {
  provider: EnrichmentFieldProvenance['provider'];
  sourceUrl: string;
  confidence: number;
  chapters?: string[];
  chapterPageRanges?: Array<ChapterPageRange | null>;
  topics?: string[];
  topicPageRanges?: Array<ChapterPageRange | null>;
  estimatedChapterPageRanges?: Array<ChapterPageRange | null>;
  chapterPageRangeTrust?: ChapterPageRangeTrust[];
  pageAnchors?: PageAnchorEvidence[];
  trustedChapterPageRangeCount?: number;
  pageRangeTrustStatus?: ChapterPageRangeTrust;
  description?: string;
  subjects?: string[];
  pages?: number | null;
  publisher?: string;
  year?: number | null;
  authors?: string[];
  isbn?: string | null;
  openLibraryKey?: string | null;
  openLibraryEditionKey?: string | null;
  openLibraryWorkKey?: string | null;
  googleBooksId?: string | null;
  tocSource?: BookEnrichment['tocSource'];
  strategy?: string;
  inferred?: boolean;
  evidenceAnchors?: string[];
  rejectedReasons?: string[];
  pageRange?: { start: number; end: number };
}

export interface StrategyResolution {
  bookPatch: Partial<BookRecord>;
  enrichment: BookEnrichment;
  provenance: EnrichmentFieldProvenance[];
}

function buildProvenance(
  candidates: StrategyCandidate[],
): EnrichmentFieldProvenance[] {
  return uniqueCompactStrings(
    candidates.map(
      (candidate) => `${candidate.provider}::${candidate.sourceUrl}`,
    ),
    12,
  ).map((key) => {
    const [provider, sourceUrl] = key.split('::');
    const candidate = candidates.find(
      (entry) => entry.provider === provider && entry.sourceUrl === sourceUrl,
    );
    return {
      provider,
      sourceUrl,
      fetchedAt: isoTimestamp(),
      confidence: candidate?.confidence ?? 0.5,
      strategy: candidate?.strategy,
      inferred: candidate?.inferred,
      evidenceAnchors: candidate?.evidenceAnchors,
      rejectedReasons: candidate?.rejectedReasons,
      pageRange: candidate?.pageRange,
      pageRangeTrustStatus: candidate?.pageRangeTrustStatus,
      trustedChapterPageRangeCount: candidate?.trustedChapterPageRangeCount,
    };
  });
}

function provenanceFor(
  provenance: EnrichmentFieldProvenance[],
  candidates: StrategyCandidate[],
  predicate: (candidate: StrategyCandidate) => boolean,
): EnrichmentFieldProvenance | undefined {
  return provenance.find((entry) =>
    candidates.some(
      (candidate) =>
        candidate.provider === entry.provider &&
        candidate.sourceUrl === entry.sourceUrl &&
        predicate(candidate),
    ),
  );
}

function candidateValueIsPresent(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return value != null && value !== '';
}

function firstCandidateValue<T>(
  candidates: StrategyCandidate[],
  select: (candidate: StrategyCandidate) => T | null | undefined,
  accept?: (candidate: StrategyCandidate, value: T) => boolean,
): T | undefined {
  for (const candidate of candidates) {
    const value = select(candidate);
    if (
      candidateValueIsPresent(value) &&
      (!accept || accept(candidate, value as T))
    ) {
      return value as T;
    }
  }
  return undefined;
}

// Align page ranges to the sanitized chapter entries by each entry's original
// index. Matching sanitized titles against raw titles by string equality lost
// ranges whenever sanitization altered a title (page suffix / dot-leader strip)
// or filtered/dedup'd an entry; sourceIndex keys survive those transforms.
function alignedCandidatePageRanges(
  selected: StrategyCandidate | null | undefined,
  entries: ChapterTitleEntry[],
): Array<ChapterPageRange | null> | undefined {
  if (!selected?.chapterPageRanges?.length) {
    return undefined;
  }
  return entries.map((entry) =>
    entry.sourceIndex != null
      ? (selected.chapterPageRanges?.[entry.sourceIndex] ?? null)
      : null,
  );
}

function topicCandidate(candidate: StrategyCandidate): StrategyCandidate | null {
  return candidate.topics?.length
    ? {
        ...candidate,
        chapters: candidate.topics,
        chapterPageRanges: candidate.topicPageRanges,
      }
    : null;
}

function existingTopicCandidate(book: BookRecord): StrategyCandidate | null {
  return book.enrichment.topics?.length
    ? {
        provider:
          book.enrichment.tocSource === 'manual' ? 'manual' : 'local_document',
        sourceUrl: `project://book/${book.id}/topics`,
        confidence: book.enrichment.tocSource === 'manual' ? 1 : 0.54,
        chapters: book.enrichment.topics,
        chapterPageRanges: book.enrichment.topicPageRanges,
        tocSource: book.enrichment.tocSource,
      }
    : null;
}

export function mergeStrategyCandidates(
  book: BookRecord,
  candidates: StrategyCandidate[],
): StrategyResolution {
  const chapterCandidates = compactItems([
    existingChapterCandidate(book),
    ...candidates,
  ]);
  const selectedChapterCandidate = bestChapterCandidate(chapterCandidates);
  const candidateChapterEntries = sanitizeChapterEntries(
    selectedChapterCandidate?.chapters ?? [],
    {
      source:
        selectedChapterCandidate?.tocSource === 'manual'
          ? 'manual'
          : 'structured',
    },
  );
  const candidateChapters = candidateChapterEntries.map((entry) => entry.title);
  const chapters = candidateChapters.length
    ? candidateChapters
    : sanitizeChapterTitles(book.enrichment.chapters, { source: 'imported' });
  const chapterPageRanges =
    candidateChapters.length
      ? alignedCandidatePageRanges(
          selectedChapterCandidate,
          candidateChapterEntries,
        )
      : book.enrichment.chapterPageRanges;
  const topicCandidates = compactItems([
    existingTopicCandidate(book),
    ...candidates.map(topicCandidate),
  ]);
  const selectedTopicCandidate = bestChapterCandidate(topicCandidates);
  const candidateTopicEntries = sanitizeChapterEntries(
    selectedTopicCandidate?.chapters ?? [],
    {
      source:
        selectedTopicCandidate?.tocSource === 'manual'
          ? 'manual'
          : 'structured',
    },
  );
  const candidateTopics = candidateTopicEntries.map((entry) => entry.title);
  const topics = candidateTopics.length
    ? candidateTopics
    : sanitizeChapterTitles(book.enrichment.topics ?? [], {
        source: 'imported',
      });
  const topicPageRanges =
    candidateTopics.length
      ? alignedCandidatePageRanges(selectedTopicCandidate, candidateTopicEntries)
      : book.enrichment.topicPageRanges;
  const pickCandidateValue = <T>(
    select: (candidate: StrategyCandidate) => T | null | undefined,
    accept?: (candidate: StrategyCandidate, value: T) => boolean,
  ): T | undefined => firstCandidateValue(candidates, select, accept);
  const description =
    pickCandidateValue((candidate) => candidate.description) ??
    book.enrichment.description;
  const subjects = uniqueCompactStrings(
    [
      ...book.subjects,
      ...book.enrichment.olSubjects,
      ...candidates.flatMap((candidate) => candidate.subjects ?? []),
    ],
    40,
  );
  const preferredPages =
    pickCandidateValue(
      (candidate) => candidate.pages,
      (candidate, pages) => candidate.provider !== 'manual' && pages > 0,
    ) ??
    pickCandidateValue(
      (candidate) => candidate.pages,
      (_candidate, pages) => pages > 0,
    );
  const provenance = buildProvenance(candidates);
  const tocSource =
    selectedChapterCandidate?.tocSource ??
    selectedTopicCandidate?.tocSource ??
    book.enrichment.tocSource;

  return {
    bookPatch: {
      authors: pickCandidateValue((candidate) => candidate.authors),
      pages: preferredPages ?? undefined,
      subjects,
      publisher: pickCandidateValue((candidate) => candidate.publisher),
      isbn: pickCandidateValue((candidate) => candidate.isbn),
      year: pickCandidateValue((candidate) => candidate.year),
      openLibraryKey: pickCandidateValue(
        (candidate) => candidate.openLibraryKey,
      ),
      openLibraryEditionKey: pickCandidateValue(
        (candidate) => candidate.openLibraryEditionKey,
      ),
      openLibraryWorkKey: pickCandidateValue(
        (candidate) => candidate.openLibraryWorkKey,
      ),
      googleBooksId: pickCandidateValue((candidate) => candidate.googleBooksId),
    },
    enrichment: {
      chapters,
      chapterPageRanges,
      topics,
      topicPageRanges,
      description,
      olSubjects: subjects,
      tocSource,
      provenance: {
        chapters:
          chapters.length && provenance[0]
            ? (provenanceFor(provenance, candidates, (candidate) =>
                Boolean(
                  selectedChapterCandidate &&
                  candidate.provider === selectedChapterCandidate.provider &&
                  candidate.sourceUrl === selectedChapterCandidate.sourceUrl &&
                  candidate.tocSource === selectedChapterCandidate.tocSource,
                ),
              ) ?? book.enrichment.provenance?.chapters)
            : book.enrichment.provenance?.chapters,
        topics:
          topics.length && provenance[0]
            ? (provenanceFor(provenance, candidates, (candidate) =>
                Boolean(
                  selectedTopicCandidate &&
                  candidate.provider === selectedTopicCandidate.provider &&
                  candidate.sourceUrl === selectedTopicCandidate.sourceUrl &&
                  candidate.topics?.length,
                ),
              ) ?? book.enrichment.provenance?.topics)
            : book.enrichment.provenance?.topics,
        description:
          description && provenance[0]
            ? (provenanceFor(provenance, candidates, (candidate) =>
                Boolean(candidate.description),
              ) ?? book.enrichment.provenance?.description)
            : book.enrichment.provenance?.description,
        subjects:
          subjects.length && provenance[0]
            ? (provenanceFor(provenance, candidates, (candidate) =>
                Boolean(candidate.subjects?.length),
              ) ?? book.enrichment.provenance?.subjects)
            : book.enrichment.provenance?.subjects,
      },
    },
    provenance,
  };
}
