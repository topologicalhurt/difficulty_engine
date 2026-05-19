import type { PlannerProjectV1 } from '../core/types';

type CalendarActivityMap = NonNullable<
  PlannerProjectV1['manualOverrides']['calendarActivities']
>;

export function removeBookFromDeferred(
  entries: Record<string, string[]>,
  bookId: string,
): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(entries)
      .map(
        ([dateKey, ids]) =>
          [dateKey, ids.filter((entryId) => entryId !== bookId)] as const,
      )
      .filter(([, ids]) => ids.length > 0),
  );
}

export function removeBookFromActuals(
  entries: PlannerProjectV1['manualOverrides']['actuals'],
  bookId: string,
): PlannerProjectV1['manualOverrides']['actuals'] {
  return Object.fromEntries(
    Object.entries(entries)
      .map(([dateKey, byBook]) => {
        const next = { ...byBook };
        delete next[bookId];
        return [dateKey, next] as const;
      })
      .filter(([, byBook]) => Object.keys(byBook).length > 0),
  );
}

export function removeBookFromTimeBlocks(
  entries: PlannerProjectV1['manualOverrides']['timeBlocks'],
  bookId: string,
): PlannerProjectV1['manualOverrides']['timeBlocks'] {
  return Object.fromEntries(
    Object.entries(entries ?? {})
      .map(([dateKey, byBook]) => {
        const next = { ...byBook };
        delete next[bookId];
        return [dateKey, next] as const;
      })
      .filter(([, byBook]) => Object.keys(byBook).length > 0),
  );
}

function nextCalendarActivityId(project: PlannerProjectV1): string {
  const existing = new Set(
    Object.keys(project.manualOverrides.calendarActivities ?? {}),
  );
  let index = existing.size + 1;
  while (existing.has(`activity-${index}`)) index += 1;
  return `activity-${index}`;
}

function normalizeActivityColor(color: string | undefined): string {
  return color && /^#[0-9a-f]{6}$/i.test(color)
    ? color.toLowerCase()
    : '#4fb3ff';
}

export function withCalendarActivity(
  project: PlannerProjectV1,
  input: Partial<CalendarActivityMap[string]>,
): PlannerProjectV1 {
  const activities = project.manualOverrides.calendarActivities ?? {};
  const id = input.id?.trim() || nextCalendarActivityId(project);
  const durationMinutes = Math.max(
    15,
    Math.min(12 * 60, Math.round(input.durationMinutes ?? 120)),
  );
  const weeklyMinutes = Math.max(
    15,
    Math.min(7 * 12 * 60, Math.round(input.weeklyMinutes ?? durationMinutes)),
  );
  const sessionsPerWeek = Math.max(
    1,
    Math.min(
      21,
      Math.round(
        input.sessionsPerWeek ?? Math.ceil(weeklyMinutes / durationMinutes),
      ),
    ),
  );
  return {
    ...project,
    manualOverrides: {
      ...project.manualOverrides,
      calendarActivities: {
        ...activities,
        [id]: {
          id,
          title: input.title?.trim() || 'Activity',
          color: normalizeActivityColor(input.color),
          mode:
            input.mode === 'flexible_weekly'
              ? 'flexible_weekly'
              : 'fixed_weekly',
          days: input.days?.length
            ? [...new Set(input.days)].sort()
            : [1, 2, 3, 4, 5],
          startMinute: normalizeHourMinute(input.startMinute ?? 18 * 60),
          durationMinutes,
          weeklyMinutes,
          sessionsPerWeek,
        },
      },
    },
  };
}

export function withoutCalendarActivity(
  project: PlannerProjectV1,
  activityId: string,
): PlannerProjectV1 {
  const calendarActivities = {
    ...(project.manualOverrides.calendarActivities ?? {}),
  };
  delete calendarActivities[activityId];
  return {
    ...project,
    manualOverrides: {
      ...project.manualOverrides,
      calendarActivities,
    },
  };
}

function withoutDeferredBook(
  project: PlannerProjectV1,
  dateKey: string,
  bookId: string,
): PlannerProjectV1['manualOverrides']['deferred'] {
  const deferredForDate = (
    project.manualOverrides.deferred[dateKey] ?? []
  ).filter((id) => id !== bookId);
  const deferred = { ...project.manualOverrides.deferred };
  if (deferredForDate.length) deferred[dateKey] = deferredForDate;
  else delete deferred[dateKey];
  return deferred;
}

function withActualEntry(
  project: PlannerProjectV1,
  dateKey: string,
  bookId: string,
  patch: PlannerProjectV1['manualOverrides']['actuals'][string][string],
): PlannerProjectV1 {
  const current = project.manualOverrides.actuals[dateKey]?.[bookId] ?? {};
  const nextEntry = { ...current, ...patch };
  const compactEntry: PlannerProjectV1['manualOverrides']['actuals'][string][string] =
    {
      ...(nextEntry.minutes != null ? { minutes: nextEntry.minutes } : {}),
      ...(nextEntry.pages != null ? { pages: nextEntry.pages } : {}),
      ...(nextEntry.done != null ? { done: nextEntry.done } : {}),
      ...(nextEntry.autoFilledFromPlan === true &&
      (nextEntry.minutes != null || nextEntry.pages != null)
        ? { autoFilledFromPlan: true }
        : {}),
    };
  const byDate = { ...(project.manualOverrides.actuals[dateKey] ?? {}) };
  if (
    compactEntry.minutes != null ||
    compactEntry.pages != null ||
    compactEntry.done != null
  ) {
    byDate[bookId] = compactEntry;
  } else {
    delete byDate[bookId];
  }
  const actuals = { ...project.manualOverrides.actuals };
  if (Object.keys(byDate).length) actuals[dateKey] = byDate;
  else delete actuals[dateKey];
  return {
    ...project,
    manualOverrides: {
      ...project.manualOverrides,
      actuals,
      deferred: withoutDeferredBook(project, dateKey, bookId),
    },
  };
}

export function withDeferredCalendarEntry(
  project: PlannerProjectV1,
  dateKey: string,
  bookId: string,
): PlannerProjectV1 {
  const deferredForDate = new Set(
    project.manualOverrides.deferred[dateKey] ?? [],
  );
  deferredForDate.add(bookId);
  const actualsForDate = {
    ...(project.manualOverrides.actuals[dateKey] ?? {}),
  };
  delete actualsForDate[bookId];
  const actuals = { ...project.manualOverrides.actuals };
  if (Object.keys(actualsForDate).length) {
    actuals[dateKey] = actualsForDate;
  } else {
    delete actuals[dateKey];
  }
  return {
    ...project,
    manualOverrides: {
      ...project.manualOverrides,
      deferred: {
        ...project.manualOverrides.deferred,
        [dateKey]: [...deferredForDate].sort(),
      },
      actuals,
    },
  };
}

export function withCalendarEntryDone(
  project: PlannerProjectV1,
  dateKey: string,
  bookId: string,
  done: boolean,
  fallback?: { minutes?: number; pages?: number },
): PlannerProjectV1 {
  const current = project.manualOverrides.actuals[dateKey]?.[bookId] ?? {};
  const shouldPersistFallback =
    done && current.minutes == null && current.pages == null;
  const removeAutoFilledProgress = !done && current.autoFilledFromPlan === true;
  return withActualEntry(
    project,
    dateKey,
    bookId,
    done
      ? {
          done,
          ...(shouldPersistFallback && fallback?.minutes != null
            ? { minutes: fallback.minutes }
            : {}),
          ...(shouldPersistFallback && fallback?.pages != null
            ? { pages: fallback.pages }
            : {}),
          ...(shouldPersistFallback ? { autoFilledFromPlan: true } : {}),
        }
      : {
          done: undefined,
          ...(removeAutoFilledProgress
            ? {
                minutes: undefined,
                pages: undefined,
                autoFilledFromPlan: undefined,
              }
            : {}),
        },
  );
}

export function withCalendarEntryMinutes(
  project: PlannerProjectV1,
  dateKey: string,
  bookId: string,
  minutes: number,
): PlannerProjectV1 {
  return withActualEntry(project, dateKey, bookId, {
    minutes: Math.max(0, minutes),
    autoFilledFromPlan: undefined,
  });
}

export function withCalendarEntryPages(
  project: PlannerProjectV1,
  dateKey: string,
  bookId: string,
  pages: number,
): PlannerProjectV1 {
  return withActualEntry(project, dateKey, bookId, {
    pages: Math.max(0, pages),
    autoFilledFromPlan: undefined,
  });
}

export function withoutCalendarEntryOverride(
  project: PlannerProjectV1,
  dateKey: string,
  bookId: string,
): PlannerProjectV1 {
  const byDate = { ...(project.manualOverrides.actuals[dateKey] ?? {}) };
  delete byDate[bookId];
  const actuals = { ...project.manualOverrides.actuals };
  if (Object.keys(byDate).length) actuals[dateKey] = byDate;
  else delete actuals[dateKey];

  return {
    ...project,
    manualOverrides: {
      ...project.manualOverrides,
      actuals,
      deferred: withoutDeferredBook(project, dateKey, bookId),
    },
  };
}

function normalizeHourMinute(value: number): number {
  return Math.max(0, Math.min(23 * 60, Math.round(value / 60) * 60));
}

export function withCalendarTimeBlock(
  project: PlannerProjectV1,
  dateKey: string,
  bookId: string,
  startMinute: number,
  durationMinutes: number,
): PlannerProjectV1 {
  const start = normalizeHourMinute(startMinute);
  const duration = Math.max(15, Math.min(12 * 60, Math.round(durationMinutes)));
  const timeBlocksByDate = project.manualOverrides.timeBlocks ?? {};
  const byDate = { ...(timeBlocksByDate[dateKey] ?? {}) };
  byDate[bookId] = {
    startMinute: start,
    durationMinutes: Math.min(duration, 24 * 60 - start),
  };
  return {
    ...project,
    manualOverrides: {
      ...project.manualOverrides,
      timeBlocks: {
        ...timeBlocksByDate,
        [dateKey]: byDate,
      },
    },
  };
}

export function withoutCalendarTimeBlock(
  project: PlannerProjectV1,
  dateKey: string,
  bookId: string,
): PlannerProjectV1 {
  const timeBlocksByDate = project.manualOverrides.timeBlocks ?? {};
  const byDate = { ...(timeBlocksByDate[dateKey] ?? {}) };
  delete byDate[bookId];
  const timeBlocks = { ...timeBlocksByDate };
  if (Object.keys(byDate).length) timeBlocks[dateKey] = byDate;
  else delete timeBlocks[dateKey];
  return {
    ...project,
    manualOverrides: {
      ...project.manualOverrides,
      timeBlocks,
    },
  };
}
