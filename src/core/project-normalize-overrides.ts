import type { PlannerProjectV1 } from './types';
import { unique } from './utils';
import {
  normalizeBoolean,
  normalizeDateKey,
  normalizeNumber,
  normalizeStringArray,
} from './project-normalize-primitives';

const MAX_ACTUAL_MINUTES_PER_ENTRY = 24 * 60;
const MAX_ACTUAL_PAGES_PER_ENTRY = 10000;

export function normalizeManualSchedule(
  value: unknown,
  validIds: Set<string>,
): PlannerProjectV1['manualOverrides']['schedule'] {
  if (!value || typeof value !== 'object') {
    return {};
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([id]) => validIds.has(id))
    .map(([id, override]) => {
      const raw =
        override && typeof override === 'object'
          ? (override as Record<string, unknown>)
          : {};
      const ds =
        raw.ds == null
          ? undefined
          : normalizeNumber(raw.ds, 0, 0, undefined, true);
      const days =
        raw.days == null
          ? undefined
          : normalizeNumber(raw.days, 1, 1, undefined, true);
      return [
        id,
        { ...(ds != null ? { ds } : {}), ...(days != null ? { days } : {}) },
      ] as const;
    })
    .filter(([, override]) => override.ds != null || override.days != null);
  return Object.fromEntries(entries);
}

export function normalizeBookIdMap(
  value: unknown,
  validIds: Set<string>,
): Record<string, string[]> {
  if (!value || typeof value !== 'object') {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(
        ([dateKey, ids]) =>
          [
            normalizeDateKey(dateKey, ''),
            unique(normalizeStringArray(ids).filter((id) => validIds.has(id))),
          ] as const,
      )
      .filter(([dateKey, ids]) => Boolean(dateKey) && ids.length > 0),
  );
}

export function normalizeActualOverrides(
  value: unknown,
  validIds: Set<string>,
): PlannerProjectV1['manualOverrides']['actuals'] {
  if (!value || typeof value !== 'object') {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([dateKey, rawByBook]) => {
        const date = normalizeDateKey(dateKey, '');
        const byBook =
          rawByBook && typeof rawByBook === 'object'
            ? Object.fromEntries(
                Object.entries(rawByBook as Record<string, unknown>)
                  .filter(([id]) => validIds.has(id))
                  .map(([id, rawOverride]) => {
                    const raw =
                      rawOverride && typeof rawOverride === 'object'
                        ? (rawOverride as Record<string, unknown>)
                        : {};
                    const minutes =
                      raw.minutes == null
                        ? undefined
                        : normalizeNumber(
                            raw.minutes,
                            0,
                            0,
                            MAX_ACTUAL_MINUTES_PER_ENTRY,
                          );
                    const pages =
                      raw.pages == null
                        ? undefined
                        : normalizeNumber(
                            raw.pages,
                            0,
                            0,
                            MAX_ACTUAL_PAGES_PER_ENTRY,
                          );
                    const done =
                      raw.done == null ? undefined : normalizeBoolean(raw.done);
                    const autoFilledFromPlan =
                      raw.autoFilledFromPlan == null
                        ? undefined
                        : normalizeBoolean(raw.autoFilledFromPlan);
                    return [
                      id,
                      {
                        ...(minutes != null ? { minutes } : {}),
                        ...(pages != null ? { pages } : {}),
                        ...(done != null ? { done } : {}),
                        ...(autoFilledFromPlan === true &&
                        (minutes != null || pages != null)
                          ? { autoFilledFromPlan: true }
                          : {}),
                      },
                    ] as const;
                  })
                  .filter(
                    ([, override]) =>
                      override.minutes != null ||
                      override.pages != null ||
                      override.done != null,
                  ),
              )
            : {};
        return [date, byBook] as const;
      })
      .filter(
        ([dateKey, byBook]) =>
          Boolean(dateKey) && Object.keys(byBook).length > 0,
      ),
  );
}
