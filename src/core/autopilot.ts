import {
  applyAutopilotCandidate,
  buildAutopilotCandidateSpecs,
  type AutopilotCandidateSpec,
} from './autopilot-candidates';
import { createDefaultAutopilotWizardState } from './default-project';
import { targetEndDateKey } from './planning-window';
import type {
  AutopilotProposal, AutopilotWizardState, EngineSnapshot, PlannerOptimizationInput,
  PlannerOptimizationObjectiveBreakdown, PlannerOptimizationPlan,
  PlannerOptimizationResult, PlannerProjectV1,
} from './types';
import { clamp, round1, round2 } from './utils';

type SnapshotEvaluator = (
  project: PlannerProjectV1,
) => EngineSnapshot | Promise<EngineSnapshot>;

const SOFT_OBJECTIVE_ORDER = [
  'infeasibility/relaxation',
  'deadline lateness',
  'prerequisite impurity',
  'overload/overwhelm',
  'uncertainty exposure',
  'context switching',
  'pacing roughness',
  'deterministic tie-break',
];

function safeDateDays(startKey: string, endKey: string): number {
  const start = Date.parse(`${startKey}T12:00:00Z`);
  const end = Date.parse(`${endKey}T12:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(0, Math.round((end - start) / 86400000));
}

function finishDateKey(snapshot: EngineSnapshot): string | null {
  return snapshot.scheduleStats.finishDate
    ? snapshot.scheduleStats.finishDate.toISOString().slice(0, 10)
    : null;
}

function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return (
    values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) /
    values.length
  );
}

function averageWorkloadUncertainty(snapshot: EngineSnapshot): number {
  const values = Object.values(snapshot.difficultyModel)
    .map((entry) => entry.workloadUncertainty)
    .filter((value): value is number => Number.isFinite(value));
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function earlyBookPenalty(
  snapshot: EngineSnapshot,
  wizard: AutopilotWizardState,
): number {
  let penalty = 0;
  wizard.scaryBookIds.forEach((id) => {
    const item = snapshot.schedulePlan.byId[id];
    if (item && item.ds <= 2) penalty += 6;
  });
  wizard.avoidEarlyBookIds.forEach((id) => {
    const item = snapshot.schedulePlan.byId[id];
    if (item && item.ds <= 4) penalty += 10;
  });
  return penalty;
}

function normalizedWizard(
  project: PlannerProjectV1,
  draft?: Partial<AutopilotWizardState>,
): AutopilotWizardState {
  const defaults = createDefaultAutopilotWizardState(project.constraints);
  const merged = { ...defaults, ...draft };
  const fallbackEnd = targetEndDateKey(
    project.constraints.sd,
    project.constraints.tl,
  );
  return {
    ...merged,
    targetEndDate: merged.targetEndDate || fallbackEnd,
    latenessToleranceDays: Math.max(
      0,
      Math.round(merged.latenessToleranceDays),
    ),
    hardParallelCap: clamp(Math.round(merged.hardParallelCap), 1, 12),
    dailyHours: clamp(merged.dailyHours, 0.25, 16),
    scaryBookIds: [...new Set(merged.scaryBookIds)].filter(
      (id) => project.library.books[id],
    ),
    avoidEarlyBookIds: [...new Set(merged.avoidEarlyBookIds)].filter(
      (id) => project.library.books[id],
    ),
  };
}

function objectiveFor(
  snapshot: EngineSnapshot,
  project: PlannerProjectV1,
  wizard: AutopilotWizardState,
  tieBreak: number,
): PlannerOptimizationObjectiveBreakdown {
  const stats = snapshot.scheduleStats;
  const finish = finishDateKey(snapshot);
  const latenessDays =
    finish && wizard.deadlinePolicy !== 'none'
      ? Math.max(
          0,
          safeDateDays(project.constraints.sd, finish) -
            safeDateDays(project.constraints.sd, wizard.targetEndDate) -
            wizard.latenessToleranceDays,
        )
      : 0;
  const strictDeadlinePenalty =
    wizard.deadlinePolicy === 'strict' && latenessDays > 0 ? 1000 : 0;
  const dayMinutes = Object.values(snapshot.dayPlan.byDate).map((entries) =>
    entries.reduce((sum, entry) => sum + entry.mins, 0),
  );
  return {
    infeasibility:
      strictDeadlinePenalty +
      stats.hardInfeasibleBooks * 150 +
      stats.blockedBooks * 100 +
      stats.capViolations * 200 +
      stats.floorViolations * 75 +
      stats.overbookedDays * 75,
    deadlineLatenessDays: round1(latenessDays),
    prerequisiteImpurity: round2(
      stats.prereqOverlapStarts +
        (project.constraints.prereqMode === 'strict' ? 0 : 2) +
        (project.constraints.bookOrderPolicy === 'enforce' ? 0 : 0.5),
    ),
    overload: round2(
      Math.max(0, stats.peakBooks - project.constraints.par) * 25 +
        Math.max(0, stats.peakMinutes - project.constraints.hpd * 60) / 10 +
        stats.floorRelaxedBooks * 2,
    ),
    uncertaintyExposure: round2(
      averageWorkloadUncertainty(snapshot) + earlyBookPenalty(snapshot, wizard),
    ),
    contextSwitching: round2(stats.peakBooks + stats.unfilledParallelSlots / 20),
    pacingRoughness: round2(Math.sqrt(variance(dayMinutes)) / 10),
    tieBreak,
  };
}

function compareObjectives(
  left: PlannerOptimizationObjectiveBreakdown,
  right: PlannerOptimizationObjectiveBreakdown,
): number {
  const keys: Array<keyof PlannerOptimizationObjectiveBreakdown> = [
    'infeasibility',
    'deadlineLatenessDays',
    'prerequisiteImpurity',
    'overload',
    'uncertaintyExposure',
    'contextSwitching',
    'pacingRoughness',
    'tieBreak',
  ];
  for (const key of keys) {
    if (left[key] !== right[key]) return left[key] - right[key];
  }
  return 0;
}

function bindingConstraints(
  snapshot: EngineSnapshot,
  wizard: AutopilotWizardState,
): string[] {
  const stats = snapshot.scheduleStats;
  const bindings = new Set<string>();
  if (stats.capViolations || stats.peakBooks >= wizard.hardParallelCap) {
    bindings.add(`parallel cap ${wizard.hardParallelCap}`);
  }
  if (stats.peakMinutes >= wizard.dailyHours * 60) {
    bindings.add(`${round1(wizard.dailyHours)}h/day time budget`);
  }
  if (stats.floorRelaxedBooks || stats.floorViolations) {
    bindings.add('minimum page floor');
  }
  if (stats.blockedBooks || stats.hardInfeasibleBooks) {
    bindings.add('prerequisite or manual schedule constraints');
  }
  if (wizard.deadlinePolicy !== 'none') {
    bindings.add(`${wizard.deadlinePolicy} target end ${wizard.targetEndDate}`);
  }
  return [...bindings];
}

function relaxationSuggestions(
  snapshot: EngineSnapshot,
  wizard: AutopilotWizardState,
): string[] {
  const stats = snapshot.scheduleStats;
  const suggestions: string[] = [];
  if (stats.peakMinutes >= wizard.dailyHours * 60) {
    suggestions.push('Increase daily study hours or extend the target date.');
  }
  if (stats.peakBooks >= wizard.hardParallelCap) {
    suggestions.push('Increase parallel slots or accept a longer plan.');
  }
  if (stats.floorViolations || stats.floorRelaxedBooks) {
    suggestions.push('Use practical floor mode or lower the minimum page floor.');
  }
  if (stats.blockedBooks || stats.hardInfeasibleBooks) {
    suggestions.push('Relax manual windows or prerequisite strictness.');
  }
  return suggestions.length
    ? suggestions
    : ['No relaxation is required for the recommended plan.'];
}

function planFromCandidate(
  spec: AutopilotCandidateSpec,
  project: PlannerProjectV1,
  snapshot: EngineSnapshot,
  objectiveBreakdown: PlannerOptimizationObjectiveBreakdown,
): PlannerOptimizationPlan {
  return {
    id: spec.id,
    label: spec.label,
    summary: spec.summary,
    constraintPatch: spec.patch,
    objectiveBreakdown,
    finishDate: finishDateKey(snapshot),
    spanWeeks: round1(snapshot.scheduleStats.spanWeeks),
    peakBooks: snapshot.scheduleStats.peakBooks,
    totalHours: round1(snapshot.scheduleStats.totalHours),
  };
}

function uniqueParetoPlans(
  plans: PlannerOptimizationPlan[],
  recommendedId: string,
): PlannerOptimizationPlan[] {
  return plans
    .filter((plan) => plan.id !== recommendedId)
    .sort((left, right) =>
      compareObjectives(left.objectiveBreakdown, right.objectiveBreakdown),
    )
    .slice(0, 3);
}

function hardInfeasible(
  snapshot: EngineSnapshot,
  objective: PlannerOptimizationObjectiveBreakdown,
  wizard: AutopilotWizardState,
): boolean {
  return (
    snapshot.scheduleStats.hardInfeasibleBooks > 0 ||
    snapshot.scheduleStats.capViolations > 0 ||
    snapshot.scheduleStats.floorViolations > 0 ||
    (wizard.deadlinePolicy === 'strict' && objective.deadlineLatenessDays > 0)
  );
}

function optimizationInput(
  project: PlannerProjectV1,
  baseSnapshot: EngineSnapshot,
  wizard: AutopilotWizardState,
  createdAt: string,
): PlannerOptimizationInput {
  return {
    createdAt,
    activeBookCount: baseSnapshot.schedulePlan.activeIds.length,
    relationCount: baseSnapshot.relations.length,
    horizonDays: safeDateDays(project.constraints.sd, wizard.targetEndDate),
    wizard,
    hardConstraints: [
      'preserve manual progress and history',
      `automatic parallel cap <= ${wizard.hardParallelCap}`,
      `${round1(wizard.dailyHours)}h/day available time`,
      `${wizard.deadlinePolicy} deadline policy`,
      `${wizard.settingsPolicy} settings policy`,
      'manual difficulty locks and overrides remain authoritative',
    ],
    softObjectiveOrder: SOFT_OBJECTIVE_ORDER,
  };
}

export async function createAutopilotProposal(
  project: PlannerProjectV1,
  baseSnapshot: EngineSnapshot,
  evaluateSnapshot: SnapshotEvaluator,
  nowIso: string,
  draft?: Partial<AutopilotWizardState>,
): Promise<AutopilotProposal> {
  const wizard = normalizedWizard(project, draft);
  const input = optimizationInput(project, baseSnapshot, wizard, nowIso);
  const evaluatedPlans = [];
  const specs = buildAutopilotCandidateSpecs(project, wizard);
  for (let index = 0; index < specs.length; index += 1) {
    const spec = specs[index];
    const candidateProject = applyAutopilotCandidate(project, spec.patch);
    const snapshot = await evaluateSnapshot(candidateProject);
    const objectiveBreakdown = objectiveFor(
      snapshot,
      candidateProject,
      wizard,
      index,
    );
    evaluatedPlans.push({
      plan: planFromCandidate(
        spec,
        candidateProject,
        snapshot,
        objectiveBreakdown,
      ),
      snapshot,
    });
  }
  evaluatedPlans.sort((left, right) =>
    compareObjectives(
      left.plan.objectiveBreakdown,
      right.plan.objectiveBreakdown,
    ),
  );
  const best = evaluatedPlans[0];
  const bestPlan = best.plan;
  const infeasible = hardInfeasible(
    best.snapshot,
    bestPlan.objectiveBreakdown,
    wizard,
  );
  const optimization: PlannerOptimizationResult = {
    status: infeasible ? 'infeasible' : 'ready',
    backend: 'browser_exact',
    proofStatus: infeasible ? 'infeasible' : 'optimal',
    proofScope:
      'Exact over the declared finite autopilot parameter portfolio; the underlying schedule remains the deterministic planner model for each candidate.',
    recommendedPlan: bestPlan,
    paretoAlternatives: uniqueParetoPlans(
      evaluatedPlans.map((entry) => entry.plan),
      bestPlan.id,
    ),
    objectiveBreakdown: bestPlan.objectiveBreakdown,
    bindingConstraints: bindingConstraints(best.snapshot, wizard),
    relaxationSuggestions: relaxationSuggestions(best.snapshot, wizard),
  };
  return {
    id: `autopilot-${nowIso}`,
    createdAt: nowIso,
    mode: wizard.goal,
    summary: `${bestPlan.label} is the recommended plan under ${wizard.deadlinePolicy} deadline policy.`,
    constraintPatch: bestPlan.constraintPatch,
    bookPatches: {},
    reasons: [
      `Solved ${evaluatedPlans.length} candidate policies with lexicographic objectives: ${SOFT_OBJECTIVE_ORDER.join(' -> ')}.`,
      `Proof status: ${optimization.proofStatus}; scope: ${optimization.proofScope}`,
      `Expected finish: ${bestPlan.finishDate ?? 'unknown'}; span ${bestPlan.spanWeeks} week(s); peak ${bestPlan.peakBooks} book(s).`,
    ],
    unchangedReasons: [
      'Manual reading logs, manual schedule windows, manual relations, ownership flags, and difficulty locks are preserved.',
      'The proposal is preview-only until Apply proposal is clicked.',
    ],
    wizard,
    optimizationInput: input,
    optimization,
  };
}
