import type {
  AiRecommendationBookContext,
  AiRecommendationContext,
  AiRecommendationRelationContext,
  AppState,
  BookRecord,
} from '../core/types';

const CONTEXT_BOOK_LIMIT = 80;
const CONTEXT_RELATION_LIMIT = 160;
const CONTEXT_SUBJECT_LIMIT = 8;

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
    subjects: [...book.subjects, ...book.enrichment.olSubjects].slice(
      0,
      CONTEXT_SUBJECT_LIMIT,
    ),
    displayGroup: book.displayGroup,
    scheduleDifficulty: difficulty?.scheduleDifficulty ?? null,
    displayDifficulty: difficulty?.displayDifficulty ?? null,
    owned: book.owned,
  };
}

function compactRelations(state: AppState): AiRecommendationRelationContext[] {
  return state.snapshot.relations
    .filter(
      (
        relation,
      ): relation is typeof relation & { type: 'prerequisite' | 'co-study' } =>
        relation.type === 'prerequisite' || relation.type === 'co-study',
    )
    .sort(
      (left, right) =>
        left.from.localeCompare(right.from) ||
        left.to.localeCompare(right.to) ||
        left.type.localeCompare(right.type),
    )
    .slice(0, CONTEXT_RELATION_LIMIT)
    .map((relation) => ({
      from: relation.from,
      to: relation.to,
      type: relation.type,
      confidence: relation.confidence,
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
    .slice(0, CONTEXT_BOOK_LIMIT)
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
  };
}

export function contextDigest(context: AiRecommendationContext): string {
  return [
    context.books.length,
    context.relations.length,
    context.constraints.parallel,
    context.constraints.scheduleAlgorithm,
  ].join('-');
}
