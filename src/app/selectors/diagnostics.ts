import type { AppState, DifficultyBreakdown, RelationEvidence } from '../../core/types';

export interface OverlapDiffView {
  anchorLabel: string;
  bookLabel: string;
  reason: string;
  timeSaved: number;
  confidence: number;
  overlapFrac: number;
  anchorTopics: string[];
  skimTopics: string[];
}

export interface DifficultyRowView {
  bookId: string;
  bookLabel: string;
  difficulty: DifficultyBreakdown;
}

export interface WorkloadClusterView {
  id: string;
  label: string;
  bookLabels: string[];
  topPhrases: string[];
  workloadPrior: number;
  confidence: number;
  evidenceSources: string[];
  assignments: Array<{
    bookLabel: string;
    metadataConfidence: number;
    subjectWorkloadPrior: number;
    similarityToCluster: number;
    nearestBookLabels: string[];
    sparseSpecialized: boolean;
    explanation: string;
  }>;
}

export interface DiagnosticsViewModel {
  passes: string[];
  warnings: string[];
  failures: string[];
  relations: RelationEvidence[];
  workloadClusters: WorkloadClusterView[];
  difficultyRows: DifficultyRowView[];
  overlapDiffs: OverlapDiffView[];
}

export function selectDiagnosticsViewModel(state: AppState): DiagnosticsViewModel {
  return {
    passes: state.snapshot.diagnostics.passes,
    warnings: state.snapshot.diagnostics.warns,
    failures: state.snapshot.diagnostics.fails,
    relations: state.snapshot.relations.slice().sort((left, right) =>
      right.score - left.score ||
      left.from.localeCompare(right.from) ||
      left.to.localeCompare(right.to) ||
      left.type.localeCompare(right.type),
    ),
    workloadClusters: state.snapshot.workloadClusters
      .map((cluster) => ({
        ...cluster,
        bookLabels: cluster.bookIds.map((id) => state.project.library.books[id]?.short || id),
        assignments: cluster.assignments.map((assignment) => ({
          bookLabel: state.project.library.books[assignment.bookId]?.short || assignment.bookId,
          metadataConfidence: assignment.metadataConfidence,
          subjectWorkloadPrior: assignment.subjectWorkloadPrior,
          similarityToCluster: assignment.similarityToCluster,
          nearestBookLabels: assignment.nearestBookIds.map((id) => state.project.library.books[id]?.short || id),
          sparseSpecialized: assignment.sparseSpecialized,
          explanation: assignment.explanation,
        })),
      }))
      .sort((left, right) => right.confidence - left.confidence || left.label.localeCompare(right.label)),
    difficultyRows: Object.entries(state.snapshot.difficultyModel)
      .map(([bookId, difficulty]) => ({
        bookId,
        bookLabel: state.project.library.books[bookId]?.short || bookId,
        difficulty,
      }))
      .sort((left, right) =>
        right.difficulty.scheduleDifficulty - left.difficulty.scheduleDifficulty ||
        left.bookLabel.localeCompare(right.bookLabel) ||
        left.bookId.localeCompare(right.bookId),
      ),
    overlapDiffs: state.snapshot.overlapClusters.flatMap((cluster) =>
      cluster.pruning.map((pruning) => {
        const anchor = state.project.library.books[cluster.primaryBookId];
        const book = state.project.library.books[pruning.bookId];
        return {
          anchorLabel: anchor?.short || cluster.primaryBookId,
          bookLabel: book?.short || pruning.bookId,
          reason: pruning.reason,
          timeSaved: pruning.timeSaved,
          confidence: pruning.confidence,
          overlapFrac: pruning.overlapFrac,
          anchorTopics: cluster.topicIds.slice(0, 12),
          skimTopics: pruning.topicIds,
        };
      }),
    ),
  };
}
