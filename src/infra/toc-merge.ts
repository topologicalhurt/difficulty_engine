import { sanitizeChapterTitles } from '../core/chapter-titles';
import type {
  BookEnrichment,
  BookRecord,
  EnrichmentFieldProvenance,
} from '../core/types';
import { uniqueCompactStrings } from '../core/utils';

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
}

export interface StrategyResolution {
  bookPatch: Partial<BookRecord>;
  enrichment: BookEnrichment;
  provenance: EnrichmentFieldProvenance[];
}

function preferredTocSource(
  current: BookEnrichment['tocSource'],
  candidates: StrategyCandidate[],
): BookEnrichment['tocSource'] {
  const winner = bestChapterCandidate(candidates);
  return winner?.tocSource ?? current;
}

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

function bestChapterCandidate(
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

function existingChapterCandidate(book: BookRecord): StrategyCandidate | null {
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
      fetchedAt: new Date().toISOString(),
      confidence: candidate?.confidence ?? 0.5,
      strategy: candidate?.strategy,
      inferred: candidate?.inferred,
      evidenceAnchors: candidate?.evidenceAnchors,
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

export function mergeStrategyCandidates(
  book: BookRecord,
  candidates: StrategyCandidate[],
): StrategyResolution {
  const chapterCandidates = [
    existingChapterCandidate(book),
    ...candidates,
  ].filter(Boolean) as StrategyCandidate[];
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
  const description =
    candidates.find((candidate) => candidate.description)?.description ??
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
    candidates.find(
      (candidate) =>
        candidate.provider !== 'manual' && (candidate.pages ?? 0) > 0,
    )?.pages ??
    candidates.find((candidate) => (candidate.pages ?? 0) > 0)?.pages;
  const provenance = buildProvenance(candidates);

  return {
    bookPatch: {
      authors:
        candidates.find((candidate) => candidate.authors?.length)?.authors ??
        undefined,
      pages: preferredPages ?? undefined,
      subjects,
      publisher:
        candidates.find((candidate) => candidate.publisher)?.publisher ??
        undefined,
      isbn: candidates.find((candidate) => candidate.isbn)?.isbn ?? undefined,
      year:
        candidates.find((candidate) => candidate.year != null)?.year ??
        undefined,
      openLibraryKey:
        candidates.find((candidate) => candidate.openLibraryKey)
          ?.openLibraryKey ?? undefined,
      openLibraryEditionKey:
        candidates.find((candidate) => candidate.openLibraryEditionKey)
          ?.openLibraryEditionKey ?? undefined,
      openLibraryWorkKey:
        candidates.find((candidate) => candidate.openLibraryWorkKey)
          ?.openLibraryWorkKey ?? undefined,
      googleBooksId:
        candidates.find((candidate) => candidate.googleBooksId)
          ?.googleBooksId ?? undefined,
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
