import type { EngineSnapshot, PlannerProjectV1, WarningItem } from './types';
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

  return warnings;
}
