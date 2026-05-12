import type { AutopilotProposal, PlannerProjectV1 } from './types';
import { clamp } from './utils';

export function createAutopilotProposal(
  project: PlannerProjectV1,
  nowIso: string,
): AutopilotProposal {
  const activeBooks = Object.values(project.library.books).filter(
    (book) => !book.ignored && !book.completed,
  );
  const currentParallel = Math.max(1, Math.round(project.constraints.par || 3));
  const nextParallel = clamp(
    activeBooks.length <= 2 ? activeBooks.length || 1 : currentParallel,
    1,
    4,
  );
  return {
    id: `autopilot-${nowIso}`,
    createdAt: nowIso,
    mode: 'confidence_first',
    summary:
      'Confidence-first autopilot proposes a lower-overwhelm plan with strict prerequisite respect, bounded profile changes, and learned non-core section skipping.',
    constraintPatch: {
      learnerProfileMode: 'confidence_builder',
      learnerAdaptivityStrength: 70,
      targetChallenge: 34,
      relativePacingStrength: 34,
      relativePacingCurve: 'smoothstep',
      dailyBookMode: 'daily_cohort',
      schedAlgo: 'balanced',
      prereqMode: 'strict',
      bookOrderPolicy: 'auto',
      feasibilityMode: 'practical',
      par: nextParallel,
    },
    readingScopeSettingsPatch: {
      defaultMode: 'skip_non_core',
    },
    bookPatches: {},
    reasons: [
      'Uses the confidence-builder profile so early sessions ramp up rather than starting at full load.',
      'Keeps prerequisite mode strict and schedule algorithm balanced to avoid fast but confusing jumps.',
      'Uses practical feasibility so hard page floors do not silently dominate every other setting.',
      'Skips trusted learned TOC/appendix/reference sections for workload while preserving source metadata.',
    ],
    unchangedReasons: [
      'Manual reading logs, manual schedule windows, manual relations, ownership flags, and difficulty locks are preserved.',
      'Hard constraints such as available hours, weekdays, and parallel cap still determine feasibility.',
    ],
  };
}
