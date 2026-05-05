import { normalizeBackfillMode } from './constraint-normalizers';
import type { AuditReport, EngineSnapshot, PlannerProjectV1 } from './types';
import { round2 } from './utils';

function hasPrereqCycle(
  id: string,
  prereqById: Record<string, string[]>,
  visiting: Set<string>,
  visited: Set<string>,
): boolean {
  if (visiting.has(id)) {
    return true;
  }
  if (visited.has(id)) {
    return false;
  }
  visiting.add(id);
  const hasCycle = (prereqById[id] || []).some((parent) =>
    hasPrereqCycle(parent, prereqById, visiting, visited),
  );
  visiting.delete(id);
  visited.add(id);
  return hasCycle;
}

export function runDiagnostics(
  project: PlannerProjectV1,
  snapshot: Omit<EngineSnapshot, 'diagnostics' | 'renderModel'>,
): AuditReport {
  const report: AuditReport = {
    passes: [],
    warns: [],
    fails: [],
    metrics: {},
  };

  const { schedulePlan, dayPlan, scheduleStats } = snapshot;
  const rows = Object.values(dayPlan.byBookStats);
  const releaseBreaks = rows.filter((row) => !row.releaseFidelity);
  const laneBreaks = rows.filter((row) => !row.laneFidelity);
  const cycleBreaks = schedulePlan.items
    .map((item) => item.id)
    .filter((id) =>
      hasPrereqCycle(id, schedulePlan.prereqById, new Set(), new Set()),
    );
  const manualBlocks = snapshot.relations.filter(
    (relation) => relation.type === 'manual-block',
  );
  const coStudyBreaks = schedulePlan.coStudyMeta.groups.filter((group) => {
    const starts = group.ids
      .map((id) => dayPlan.byBookStats[id]?.actualStart)
      .filter((value): value is number => value != null);
    return starts.length >= 2 && Math.max(...starts) - Math.min(...starts) > 0;
  });

  if (releaseBreaks.length === 0) {
    report.passes.push('Release fidelity holds across the canonical day plan.');
  } else {
    report.fails.push(
      `${releaseBreaks.length} item(s) start before their canonical release slot.`,
    );
  }

  if (cycleBreaks.length === 0) {
    report.passes.push('The prerequisite graph is acyclic.');
  } else {
    report.fails.push(
      `${cycleBreaks.length} item(s) participate in a prerequisite cycle.`,
    );
  }

  if (
    normalizeBackfillMode(project.constraints.backfillMode) ===
    'lane_preserving'
  ) {
    if (laneBreaks.length === 0) {
      report.passes.push('Lane predecessor ordering is respected.');
    } else {
      report.fails.push(
        `${laneBreaks.length} item(s) violate lane predecessor order.`,
      );
    }
  } else {
    report.passes.push(
      'Display lanes are treated as visual-only in the selected backfill mode.',
    );
  }

  if (coStudyBreaks.length === 0) {
    report.passes.push(
      'Co-study groups stay synchronized when they are active.',
    );
  } else {
    report.warns.push(
      `${coStudyBreaks.length} co-study group(s) drifted across different actual start days.`,
    );
  }

  if (manualBlocks.length === 0) {
    report.passes.push(
      'Manual relation overrides did not conflict with graph safety rules.',
    );
  } else {
    report.warns.push(
      `${manualBlocks.length} manual relation override(s) were ignored to preserve graph consistency.`,
    );
  }

  if (scheduleStats.overbookedDays === 0) {
    report.passes.push('Daily time usage stays within the configured budget.');
  } else {
    report.fails.push(
      `${scheduleStats.overbookedDays} study day(s) exceed the configured hours/day budget.`,
    );
  }

  if (
    scheduleStats.floorViolations === 0 &&
    scheduleStats.capViolations === 0
  ) {
    report.passes.push(
      'All day chunks stay within the configured page bounds.',
    );
  } else {
    report.fails.push(
      `${scheduleStats.floorViolations + scheduleStats.capViolations} chunk(s) fall outside the configured page bounds.`,
    );
  }

  if (scheduleStats.unfinishedBooks === 0) {
    report.passes.push(
      'Every scheduled book is fully accounted for in the canonical plan.',
    );
  } else {
    const unexplainedUnfinished = rows.filter(
      (row) =>
        (row.unfinishedPages || 0) > 0.01 &&
        !row.hardInfeasible &&
        !row.infeasibleReason &&
        !row.blockedReason,
    );
    if (unexplainedUnfinished.length) {
      report.fails.push(
        `${scheduleStats.unfinishedBooks} scheduled book(s) still have unresolved pages; ${unexplainedUnfinished.length} lack blocker reasons.`,
      );
    } else {
      report.warns.push(
        `${scheduleStats.unfinishedBooks} scheduled book(s) still have unresolved pages.`,
      );
    }
  }

  const missingEnrichmentIds = Object.values(project.library.books)
    .filter((book) => {
      const hasEvidence =
        book.subjects.length > 0 ||
        book.enrichment.olSubjects.length > 0 ||
        book.enrichment.chapters.length > 0 ||
        Boolean(book.enrichment.description.trim());
      return (
        !book.ignored &&
        !book.completed &&
        !hasEvidence &&
        project.enrichmentCache[book.id]?.status !== 'success'
      );
    })
    .map((book) => book.id);
  if (missingEnrichmentIds.length === 0) {
    report.passes.push(
      'Every active book has either local evidence or enrichment coverage.',
    );
  } else {
    report.warns.push(
      `${missingEnrichmentIds.length} active book(s) still lack strong metadata evidence and need enrichment attention.`,
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
  if (lowDifficultyConfidenceIds.length === 0) {
    report.passes.push(
      'Adaptive workload clusters have enough evidence for active difficulty estimates.',
    );
  } else {
    report.warns.push(
      `${lowDifficultyConfidenceIds.length} active book(s) have low difficulty confidence from sparse subject, description, or chapter evidence.`,
    );
  }

  report.metrics = {
    relationConfidence: round2(snapshot.relationConfidence),
    totalTopics: snapshot.topics.length,
    totalRelations: snapshot.relations.length,
    totalScheduled: schedulePlan.items.length,
    spanWeeks: round2(scheduleStats.spanWeeks),
    finishDate: scheduleStats.finishDate
      ? scheduleStats.finishDate.toISOString()
      : null,
    hardInfeasibleBooks: scheduleStats.hardInfeasibleBooks,
    floorRelaxedBooks: scheduleStats.floorRelaxedBooks,
    underfilledParallelDays: scheduleStats.underfilledParallelDays,
    unfilledParallelSlots: scheduleStats.unfilledParallelSlots,
    parallelFitBlockedDays: scheduleStats.parallelFitBlockedDays,
    emptyStudyDays: scheduleStats.emptyStudyDays,
    backfilledStarts: scheduleStats.backfilledStarts,
    prereqOverlapStarts: scheduleStats.prereqOverlapStarts,
    missingEnrichmentBooks: missingEnrichmentIds.length,
    lowDifficultyConfidenceBooks: lowDifficultyConfidenceIds.length,
    workloadClusters: snapshot.workloadClusters.length,
    blockedManualRelations: manualBlocks.length,
    prereqCycleBooks: cycleBreaks.length,
  };

  return report;
}
