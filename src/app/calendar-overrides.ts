import type { PlannerProjectV1 } from '../core/types';

export function removeBookFromDeferred(
  entries: Record<string, string[]>,
  bookId: string,
): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(entries)
      .map(([dateKey, ids]) => [dateKey, ids.filter((entryId) => entryId !== bookId)] as const)
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

function withoutDeferredBook(
  project: PlannerProjectV1,
  dateKey: string,
  bookId: string,
): PlannerProjectV1['manualOverrides']['deferred'] {
  const deferredForDate = (project.manualOverrides.deferred[dateKey] ?? []).filter((id) => id !== bookId);
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
  const byDate = { ...(project.manualOverrides.actuals[dateKey] ?? {}) };
  if (nextEntry.minutes != null || nextEntry.pages != null || nextEntry.done != null) {
    byDate[bookId] = nextEntry;
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
  const deferredForDate = new Set(project.manualOverrides.deferred[dateKey] ?? []);
  deferredForDate.add(bookId);
  const actualsForDate = { ...(project.manualOverrides.actuals[dateKey] ?? {}) };
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
): PlannerProjectV1 {
  return withActualEntry(project, dateKey, bookId, done ? { done } : { done: undefined });
}

export function withCalendarEntryMinutes(
  project: PlannerProjectV1,
  dateKey: string,
  bookId: string,
  minutes: number,
): PlannerProjectV1 {
  return withActualEntry(project, dateKey, bookId, { minutes: Math.max(0, minutes) });
}

export function withCalendarEntryPages(
  project: PlannerProjectV1,
  dateKey: string,
  bookId: string,
  pages: number,
): PlannerProjectV1 {
  return withActualEntry(project, dateKey, bookId, { pages: Math.max(0, pages) });
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
