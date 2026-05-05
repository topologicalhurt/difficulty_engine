import { buildRenderWarnings } from './render-warnings';
import type { EngineSnapshot, PlannerProjectV1, RenderModel } from './types';

export function buildRenderModel(
  project: PlannerProjectV1,
  snapshot: Omit<EngineSnapshot, 'renderModel' | 'diagnostics'>,
  timelineSlots: number,
): RenderModel {
  const { schedulePlan, dayPlan } = snapshot;
  const warnings = buildRenderWarnings(project, snapshot);
  const actualEnd = Math.max(
    timelineSlots,
    ...schedulePlan.items.map((item) =>
      Math.max(item.de || 0, dayPlan.byBookStats[item.id]?.actualEnd || 0),
    ),
  );

  const rows = schedulePlan.items.map((item) => {
    const actual = dayPlan.byBookStats[item.id];
    return {
      id: item.id,
      short: item.short,
      displayGroup: item.displayGroup,
      lane: item.lane,
      releaseSlot: item.releaseSlot,
      targetStart: item.ds,
      targetEnd: item.de,
      actualStart: actual?.actualStart ?? null,
      actualEnd: actual?.actualEnd ?? null,
      unresolvedPages: actual?.unfinishedPages ?? 0,
      boostedDays: actual?.boostedDays ?? 0,
      strictMinPg: actual?.strictMinPg ?? item.strictMinPg,
      effectiveMinPg: actual?.effectiveMinPg ?? item.effectiveMinPg,
      floorRelaxed: Boolean(actual?.floorRelaxed ?? item.floorRelaxed),
      backfilled: Boolean(actual?.backfilled),
      prereqOverlapUsed: Boolean(actual?.prereqOverlapUsed),
    };
  });

  return {
    warnings,
    gantt: {
      timelineSlots,
      totalSlots: Math.max(
        timelineSlots,
        actualEnd + Math.ceil(project.constraints.dpw * 6),
      ),
      rows,
    },
    calendar: {
      byDate: dayPlan.byDate,
      missedByDate: dayPlan.missedByDate,
    },
  };
}
