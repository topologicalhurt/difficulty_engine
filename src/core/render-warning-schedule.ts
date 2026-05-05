import {
  minutesPerPage,
  pageBounds,
  slotBudgetMinutes,
  totalBudgetMinutes,
} from './constraints';
import { normalizeFeasibilityMode } from './constraint-normalizers';
import { createWarning } from './render-warning-utils';
import type { EngineSnapshot, PlannerProjectV1, WarningItem } from './types';
import { round1 } from './utils';

function strictParallelFitWarning(
  project: PlannerProjectV1,
  snapshot: Omit<EngineSnapshot, 'renderModel' | 'diagnostics'>,
): WarningItem | null {
  const requestedBooks = Math.max(1, Math.trunc(project.constraints.par || 1));
  if (
    requestedBooks <= 1 ||
    snapshot.scheduleStats.parallelFitBlockedDays === 0
  ) {
    return null;
  }

  const strictMinPg = pageBounds(project.constraints).minPg;
  const dailyBudget = totalBudgetMinutes(project.constraints);
  const slotBudget = slotBudgetMinutes(project.constraints);
  const floorChunks = snapshot.schedulePlan.items
    .filter((item) => !snapshot.dayPlan.byBookStats[item.id]?.hardInfeasible)
    .map((item) => ({
      id: item.id,
      minutes:
        strictMinPg *
        minutesPerPage(item.scheduleDifficulty, project.constraints),
    }))
    .sort(
      (left, right) =>
        left.minutes - right.minutes || left.id.localeCompare(right.id),
    );
  if (!floorChunks.length) return null;

  let usedMinutes = 0;
  let fitCount = 0;
  floorChunks.forEach((chunk) => {
    if (fitCount >= requestedBooks) return;
    if (usedMinutes + chunk.minutes <= dailyBudget + 1e-6) {
      usedMinutes += chunk.minutes;
      fitCount += 1;
    }
  });
  const overSlotCount = floorChunks.filter(
    (chunk) => chunk.minutes > slotBudget + 1e-6,
  ).length;
  if (fitCount >= requestedBooks && overSlotCount === 0) return null;

  const largestFloorChunk = Math.max(
    ...floorChunks.map((chunk) => chunk.minutes),
  );
  return createWarning(
    'warn',
    'strict-parallel-floor-conflict',
    `${requestedBooks} parallel slot(s) are requested, but strict ${strictMinPg} pg chunks fit at most ${fitCount} book(s) inside ${round1(dailyBudget)}m/day. Each slot has ${round1(slotBudget)}m, and ${overSlotCount} book(s) need more than that for ${strictMinPg} pages (up to ${round1(largestFloorChunk)}m). Use relaxed page recommendation, lower min pages, or increase hours/day to fill more slots.`,
    floorChunks
      .filter((chunk) => chunk.minutes > slotBudget + 1e-6)
      .map((chunk) => chunk.id),
  );
}

function buildStrictModeWarnings(
  project: PlannerProjectV1,
  snapshot: Omit<EngineSnapshot, 'renderModel' | 'diagnostics'>,
): WarningItem[] {
  const { dayPlan, scheduleStats } = snapshot;
  const warnings: WarningItem[] = [];
  const fitWarning = strictParallelFitWarning(project, snapshot);
  if (fitWarning) warnings.push(fitWarning);
  if (scheduleStats.hardInfeasibleBooks > 0) {
    warnings.push(
      createWarning(
        'fail',
        'strict-floor-infeasible',
        `${scheduleStats.hardInfeasibleBooks} book(s) cannot meet the strict ${project.constraints.minPg} pg/day floor inside the hard ${project.constraints.hpd}h/day time budget.`,
        Object.values(dayPlan.byBookStats)
          .filter((entry) => entry.hardInfeasible)
          .map((entry) => entry.id),
      ),
    );
  }
  if (scheduleStats.blockedBooks > 0) {
    warnings.push(
      createWarning(
        'fail',
        'strict-floor-blocked',
        `${scheduleStats.blockedBooks} book(s) remain blocked by prerequisite or lane constraints.`,
        Object.values(dayPlan.byBookStats)
          .filter((entry) => !entry.hardInfeasible && entry.blockedReason)
          .map((entry) => entry.id),
      ),
    );
  }
  return warnings;
}

function buildRelaxedModeWarnings(
  project: PlannerProjectV1,
  snapshot: Omit<EngineSnapshot, 'renderModel' | 'diagnostics'>,
): WarningItem[] {
  const { dayPlan, scheduleStats } = snapshot;
  const warnings: WarningItem[] = [];
  if (scheduleStats.hardInfeasibleBooks > 0) {
    warnings.push(
      createWarning(
        'fail',
        'hard-infeasible',
        `${scheduleStats.hardInfeasibleBooks} book(s) remain truly infeasible even after relaxing the page floor.`,
        Object.values(dayPlan.byBookStats)
          .filter((entry) => entry.hardInfeasible)
          .map((entry) => entry.id),
      ),
    );
  }
  if (scheduleStats.floorRelaxedBooks > 0) {
    warnings.push(
      createWarning(
        'warn',
        'relaxed-floor',
        `${scheduleStats.floorRelaxedBooks} book(s) had the ${project.constraints.minPg} pg/day floor relaxed to preserve a feasible plan.`,
        Object.values(dayPlan.byBookStats)
          .filter((entry) => entry.floorRelaxed)
          .map((entry) => entry.id),
      ),
    );
  }
  if (scheduleStats.underfilledParallelDays > 0) {
    const fitLimited = scheduleStats.parallelFitBlockedDays > 0;
    warnings.push(
      createWarning(
        'warn',
        'underfilled-parallel',
        fitLimited
          ? `${scheduleStats.parallelFitBlockedDays} day(s) had eligible books but could not fit all ${project.constraints.par} parallel slots inside the current page-floor and time-budget constraints.`
          : `${scheduleStats.underfilledParallelDays} day(s) could not fill all ${project.constraints.par} parallel slots because only ${scheduleStats.maxStartableBooksOnUnderfilledDays} book(s) were startable under the current prerequisite policy.`,
      ),
    );
  }
  if (scheduleStats.blockedBooks > 0) {
    warnings.push(
      createWarning(
        'warn',
        'blocked-books',
        `${scheduleStats.blockedBooks} book(s) still remain blocked by prerequisite or manual-window constraints.`,
        Object.values(dayPlan.byBookStats)
          .filter((entry) => !entry.hardInfeasible && entry.blockedReason)
          .map((entry) => entry.id),
      ),
    );
  }
  return warnings;
}

export function buildScheduleWarnings(
  project: PlannerProjectV1,
  snapshot: Omit<EngineSnapshot, 'renderModel' | 'diagnostics'>,
): WarningItem[] {
  const { dayPlan, scheduleStats } = snapshot;
  const warnings =
    normalizeFeasibilityMode(project.constraints.feasibilityMode) ===
    'strict_floor'
      ? buildStrictModeWarnings(project, snapshot)
      : buildRelaxedModeWarnings(project, snapshot);

  const unfinishedRows = Object.values(dayPlan.byBookStats).filter(
    (entry) => (entry.unfinishedPages || 0) > 0.01,
  );
  if (unfinishedRows.length > 0) {
    const unexplainedRows = unfinishedRows.filter(
      (entry) =>
        !entry.hardInfeasible &&
        !entry.infeasibleReason &&
        !entry.blockedReason,
    );
    warnings.push(
      createWarning(
        unexplainedRows.length ? 'fail' : 'warn',
        'unfinished-books',
        unexplainedRows.length
          ? `${unfinishedRows.length} book(s) remain unresolved in the generated plan; ${unexplainedRows.length} lack a blocker reason.`
          : `${unfinishedRows.length} book(s) remain unresolved in the generated plan.`,
        unfinishedRows.map((entry) => entry.id),
      ),
    );
  }

  if (scheduleStats.spillWeeks > 0) {
    warnings.push(
      createWarning(
        'warn',
        'timeline-spill',
        `The resolved plan extends ${scheduleStats.spillWeeks.toFixed(1)} week(s) past the configured timeline.`,
      ),
    );
  }

  if (scheduleStats.peakBooks > project.constraints.par) {
    warnings.push(
      createWarning(
        'warn',
        'peak-concurrency',
        `Peak concurrency reaches ${scheduleStats.peakBooks} while parallel is set to ${project.constraints.par}.`,
      ),
    );
  }

  return warnings;
}
