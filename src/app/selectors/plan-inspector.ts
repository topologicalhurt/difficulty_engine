import type {
  AppState,
  DifficultyBreakdown,
  RelationEvidence,
  SchedulePlanItem,
} from '../../core/types';
import type { BookProgressView } from './progress';

export interface BookInspectorViewModel {
  fallbackId: string | null;
  bookTitle: string;
  displayGroup: string;
  pages: number;
  schedule: SchedulePlanItem | null;
  dayStats: AppState['snapshot']['dayPlan']['byBookStats'][string] | null;
  difficulty: DifficultyBreakdown | null;
  progress: BookProgressView | null;
  incoming: RelationEvidence[];
  outgoing: RelationEvidence[];
  explanation: string[];
}

export function selectBookInspector(
  state: AppState,
  progressByBook: Record<string, BookProgressView>,
): BookInspectorViewModel {
  const fallbackId = state.ui.selectedBookId;
  const book = fallbackId ? state.project.library.books[fallbackId] : undefined;
  const difficulty = fallbackId
    ? state.snapshot.difficultyModel[fallbackId]
    : undefined;
  return {
    fallbackId,
    bookTitle: book?.title ?? '',
    displayGroup: book?.displayGroup || 'Ungrouped',
    pages: book?.pages ?? 0,
    schedule: fallbackId
      ? (state.snapshot.schedulePlan.byId[fallbackId] ?? null)
      : null,
    dayStats: fallbackId
      ? (state.snapshot.dayPlan.byBookStats[fallbackId] ?? null)
      : null,
    difficulty: difficulty ?? null,
    progress: fallbackId ? (progressByBook[fallbackId] ?? null) : null,
    incoming: fallbackId
      ? state.snapshot.relations.filter(
          (relation) => relation.to === fallbackId,
        )
      : [],
    outgoing: fallbackId
      ? state.snapshot.relations.filter(
          (relation) => relation.from === fallbackId,
        )
      : [],
    explanation: difficulty?.explanation.slice(0, 4) ?? [],
  };
}
