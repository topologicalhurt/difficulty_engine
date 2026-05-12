import type {
  AiRecommendationBookContext,
  AiRecommendationContext,
  AiRecommendationRelationContext,
  AppState,
  BookRecord,
} from '../core/types';

const FNV1A_OFFSET_BASIS = 2166136261;
const FNV1A_PRIME = 16777619;

function actualProgress(
  state: AppState,
  bookId: string,
): AiRecommendationBookContext['progress'] {
  return Object.values(state.project.manualOverrides.actuals).reduce<
    AiRecommendationBookContext['progress']
  >(
    (total, byBook) => {
      const entry = byBook[bookId];
      if (!entry) return total;
      return {
        completed: total.completed || Boolean(entry.done),
        actualPages: total.actualPages + Math.max(0, entry.pages ?? 0),
        actualMinutes: total.actualMinutes + Math.max(0, entry.minutes ?? 0),
      };
    },
    { completed: false, actualPages: 0, actualMinutes: 0 },
  );
}

function compactBook(
  book: BookRecord,
  state: AppState,
): AiRecommendationBookContext {
  const difficulty = state.snapshot.difficultyModel[book.id];
  return {
    id: book.id,
    title: book.title,
    authors: book.authors,
    isbn: book.isbn,
    pages: book.pages,
    subjects: [...book.subjects, ...book.enrichment.olSubjects],
    displayGroup: book.displayGroup,
    scheduleDifficulty: difficulty?.scheduleDifficulty ?? null,
    displayDifficulty: difficulty?.displayDifficulty ?? null,
    latentWorkload: difficulty?.latentWorkload ?? null,
    workloadUncertainty: difficulty?.workloadUncertainty ?? null,
    evidenceConfidence: difficulty?.evidenceConfidence ?? null,
    chapters: [...book.enrichment.chapters],
    tocSource: book.enrichment.tocSource,
    documentStatuses: (book.documents ?? []).map((document) => ({
      provider: document.provider,
      contentKind: document.contentKind,
      status: document.status,
      matchScore: document.matchScore,
      progress: document.availability.progress,
      seeders: document.availability.seeders,
    })),
    progress: actualProgress(state, book.id),
    owned: book.owned,
    ignored: book.ignored,
    completed: book.completed,
  };
}

function compactRelations(state: AppState): AiRecommendationRelationContext[] {
  return state.snapshot.relations
    .sort(
      (left, right) =>
        left.from.localeCompare(right.from) ||
        left.to.localeCompare(right.to) ||
        left.type.localeCompare(right.type),
    )
    .map((relation): AiRecommendationRelationContext => ({
      from: relation.from,
      to: relation.to,
      type: relation.type,
      confidence: relation.confidence,
      score: relation.score,
      reasons: relation.reasons,
      sources: relation.sources,
    }));
}

export function buildAiRecommendationContext(
  state: AppState,
): AiRecommendationContext {
  const books = Object.values(state.project.library.books)
    .sort(
      (left, right) =>
        left.planOrder - right.planOrder ||
        left.title.localeCompare(right.title),
    )
    .map((book) => compactBook(book, state));
  return {
    books,
    relations: state.project.aiRecommendationSettings.includeExistingContext
      ? compactRelations(state)
      : [],
    constraints: {
      parallel: state.project.constraints.par,
      hoursPerDay: state.project.constraints.hpd,
      minPages: state.project.constraints.minPg,
      maxPages: state.project.constraints.maxPg,
      scheduleAlgorithm: state.project.constraints.schedAlgo,
      prerequisiteMode: state.project.constraints.prereqMode,
      bookOrderPolicy: state.project.constraints.bookOrderPolicy,
    },
    diagnostics: {
      warns: [...state.snapshot.diagnostics.warns],
      fails: [...state.snapshot.diagnostics.fails],
    },
  };
}

export function contextDigest(context: AiRecommendationContext): string {
  const serialized = JSON.stringify(context);
  let hash = FNV1A_OFFSET_BASIS;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, FNV1A_PRIME);
  }
  return (hash >>> 0).toString(36);
}
