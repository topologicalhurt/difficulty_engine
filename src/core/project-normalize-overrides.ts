import type { CalendarActivityMode, PlannerProjectV1 } from './types';
import { unique } from './utils';
import {
  normalizeBoolean,
  normalizeDateKey,
  normalizeNumber,
  normalizeString,
  normalizeStringArray,
  normalizeWeekdays,
} from './project-normalize-primitives';

const MAX_ACTUAL_MINUTES_PER_ENTRY = 24 * 60;
const MAX_ACTUAL_PAGES_PER_ENTRY = 10000;
const DAY_MINUTES = 24 * 60;
const TIME_BLOCK_GRANULARITY_MINUTES = 60;
const MIN_TIME_BLOCK_DURATION_MINUTES = 15;
const MAX_TIME_BLOCK_DURATION_MINUTES = 12 * 60;
const DEFAULT_ACTIVITY_COLOR = '#4fb3ff';
const MAX_ACTIVITY_TITLE_LENGTH = 80;
const MAX_ACTIVITY_WEEKLY_MINUTES = 7 * 12 * 60;
const MAX_ACTIVITY_SESSIONS_PER_WEEK = 21;

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

function normalizeClockMinute(value: unknown): number {
  const minute = normalizeNumber(value, 0, 0, DAY_MINUTES - 1, true);
  return Math.min(
    DAY_MINUTES - TIME_BLOCK_GRANULARITY_MINUTES,
    Math.round(minute / TIME_BLOCK_GRANULARITY_MINUTES) *
      TIME_BLOCK_GRANULARITY_MINUTES,
  );
}

export function normalizeTimeBlockOverrides(
  value: unknown,
  validIds: Set<string>,
): PlannerProjectV1['manualOverrides']['timeBlocks'] {
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
                  .map(([id, rawBlock]) => {
                    const raw =
                      rawBlock && typeof rawBlock === 'object'
                        ? (rawBlock as Record<string, unknown>)
                        : {};
                    const startMinute = normalizeClockMinute(raw.startMinute);
                    const durationMinutes = normalizeNumber(
                      raw.durationMinutes,
                      TIME_BLOCK_GRANULARITY_MINUTES,
                      MIN_TIME_BLOCK_DURATION_MINUTES,
                      MAX_TIME_BLOCK_DURATION_MINUTES,
                      true,
                    );
                    return [
                      id,
                      {
                        startMinute,
                        durationMinutes: Math.min(
                          durationMinutes,
                          DAY_MINUTES - startMinute,
                        ),
                      },
                    ] as const;
                  }),
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

function normalizeActivityColor(value: unknown): string {
  const normalized = normalizeString(value, DEFAULT_ACTIVITY_COLOR);
  return /^#[0-9a-f]{6}$/i.test(normalized)
    ? normalized.toLowerCase()
    : DEFAULT_ACTIVITY_COLOR;
}

function normalizeActivityMode(value: unknown): CalendarActivityMode {
  return value === 'flexible_weekly' ? 'flexible_weekly' : 'fixed_weekly';
}

export function normalizeCalendarActivityOverrides(
  value: unknown,
): PlannerProjectV1['manualOverrides']['calendarActivities'] {
  if (!value || typeof value !== 'object') {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([fallbackId, rawActivity]) => {
        const raw =
          rawActivity && typeof rawActivity === 'object'
            ? (rawActivity as Record<string, unknown>)
            : {};
        const id = normalizeString(raw.id, fallbackId).replace(
          /[^a-z0-9_-]/gi,
          '',
        );
        const title = normalizeString(raw.title, 'Activity').slice(
          0,
          MAX_ACTIVITY_TITLE_LENGTH,
        );
        const mode = normalizeActivityMode(raw.mode);
        const durationMinutes = normalizeNumber(
          raw.durationMinutes,
          2 * TIME_BLOCK_GRANULARITY_MINUTES,
          MIN_TIME_BLOCK_DURATION_MINUTES,
          MAX_TIME_BLOCK_DURATION_MINUTES,
          true,
        );
        const weeklyMinutes = normalizeNumber(
          raw.weeklyMinutes,
          durationMinutes,
          MIN_TIME_BLOCK_DURATION_MINUTES,
          MAX_ACTIVITY_WEEKLY_MINUTES,
          true,
        );
        const sessionsPerWeek = normalizeNumber(
          raw.sessionsPerWeek,
          Math.max(1, Math.ceil(weeklyMinutes / durationMinutes)),
          1,
          MAX_ACTIVITY_SESSIONS_PER_WEEK,
          true,
        );
        return [
          id,
          {
            id,
            title: title || 'Activity',
            color: normalizeActivityColor(raw.color),
            mode,
            days: normalizeWeekdays(raw.days, [1, 2, 3, 4, 5]),
            startMinute: normalizeClockMinute(raw.startMinute),
            durationMinutes,
            weeklyMinutes,
            sessionsPerWeek,
          },
        ] as const;
      })
      .filter(([id]) => Boolean(id)),
  );
}
