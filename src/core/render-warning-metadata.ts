import type { EngineSnapshot, PlannerProjectV1, WarningItem } from './types';
import { difficultyDistributionStats } from './difficulty-mapping';
import { createWarning } from './render-warning-utils';

export function buildMetadataWarnings(
  project: PlannerProjectV1,
  snapshot: Omit<EngineSnapshot, 'renderModel' | 'diagnostics'>,
): WarningItem[] {
  const warnings: WarningItem[] = [];
  const missingEnrichmentIds = Object.values(project.library.books)
    .filter((book) => {
      const hasLocalEvidence =
        book.subjects.length > 0 ||
        book.enrichment.olSubjects.length > 0 ||
        book.enrichment.chapters.length > 0 ||
        Boolean(book.enrichment.description.trim());
      const cacheStatus = project.enrichmentCache[book.id]?.status;
      return (
        !book.ignored &&
        !book.completed &&
        !hasLocalEvidence &&
        cacheStatus !== 'success'
      );
    })
    .map((book) => book.id);

  if (missingEnrichmentIds.length > 0) {
    warnings.push(
      createWarning(
        'warn',
        'missing-enrichment',
        `${missingEnrichmentIds.length} active book(s) are still using thin local metadata; inference confidence will remain lower until enrichment succeeds.`,
        missingEnrichmentIds,
      ),
    );
  }

  const lowDifficultyConfidenceIds = Object.entries(snapshot.difficultyModel)
    .filter(([id, difficulty]) => {
      const book = project.library.books[id];
      return Boolean(
        book &&
        !book.ignored &&
        !book.completed &&
        difficulty.metadataConfidence < 0.35,
      );
    })
    .map(([id]) => id);

  if (lowDifficultyConfidenceIds.length > 0) {
    warnings.push(
      createWarning(
        'warn',
        'low-difficulty-confidence',
        `${lowDifficultyConfidenceIds.length} active book(s) have low difficulty confidence because subjects, descriptions, or chapters are sparse. Enrichment or a PDF/TOC will improve the workload estimate.`,
        lowDifficultyConfidenceIds,
      ),
    );
  }

  const activeDifficulties = Object.entries(snapshot.difficultyModel).filter(
    ([id]) => {
      const book = project.library.books[id];
      return Boolean(book && !book.ignored && !book.completed);
    },
  );
  const highUncertaintyIds = activeDifficulties
    .filter(([, difficulty]) => difficulty.workloadUncertainty >= 0.55)
    .map(([id]) => id);
  if (highUncertaintyIds.length > 0) {
    warnings.push(
      createWarning(
        'warn',
        'high-difficulty-uncertainty',
        `${highUncertaintyIds.length} active book(s) have uncertain workload estimates; logged reading progress, enrichment, or a better TOC will make difficulty less compressed.`,
        highUncertaintyIds,
      ),
    );
  }

  const distribution = difficultyDistributionStats(
    activeDifficulties.map(([, difficulty]) => difficulty.scheduleDifficulty),
  );
  if (activeDifficulties.length >= 3 && distribution.spread < 0.8) {
    const avgConfidence =
      activeDifficulties.reduce(
        (total, [, difficulty]) => total + difficulty.evidenceConfidence,
        0,
      ) / activeDifficulties.length;
    const reason =
      avgConfidence < 0.45
        ? 'Evidence confidence is low, so the model is shrinking scores toward the neutral prior.'
        : 'The available evidence is genuinely similar, so the confidence-gated cohort calibration is not forcing artificial separation.';
    warnings.push(
      createWarning(
        'info',
        'low-raw-difficulty-variance',
        `Raw schedule difficulties are tightly clustered (${distribution.spread.toFixed(1)} spread). ${reason}`,
        activeDifficulties.map(([id]) => id),
      ),
    );
  }

  return warnings;
}
