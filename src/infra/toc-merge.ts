import { sanitizeChapterTitles } from '../core/chapter-titles';
import type {
  BookEnrichment,
  BookRecord,
  EnrichmentFieldProvenance,
} from '../core/types';
import { compactItems, uniqueCompactStrings } from '../core/utils';
import {
  bestChapterCandidate,
  existingChapterCandidate,
  preferredTocSource,
} from './toc-candidate-ranking';
import { isoTimestamp } from './cache-time';

export interface StrategyCandidate {
  provider: EnrichmentFieldProvenance['provider'];
  sourceUrl: string;
  confidence: number;
  chapters?: string[];
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

export function mergeStrategyCandidates(
  book: BookRecord,
  candidates: StrategyCandidate[],
): StrategyResolution {
  const chapterCandidates = compactItems([
    existingChapterCandidate(book),
    ...candidates,
  ]);
  const selectedChapterCandidate = bestChapterCandidate(chapterCandidates);
  const candidateChapters = sanitizeChapterTitles(
    selectedChapterCandidate?.chapters ?? [],
    {
      source:
        selectedChapterCandidate?.tocSource === 'manual'
          ? 'manual'
          : 'structured',
    },
  );
  const chapters = candidateChapters.length
    ? candidateChapters
    : sanitizeChapterTitles(book.enrichment.chapters, { source: 'imported' });
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
      description,
      olSubjects: subjects,
      tocSource: preferredTocSource(
        book.enrichment.tocSource,
        chapterCandidates,
      ),
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
