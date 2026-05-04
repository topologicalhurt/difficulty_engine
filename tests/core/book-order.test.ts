import { describe, expect, it } from 'vitest';

import { DEFAULT_CONSTRAINTS, EXAMPLE_BOOK, createDefaultSourceSettings } from '../../src/core/defaults';
import type { BookRecord, PlannerProjectV1 } from '../../src/core/types';
import { computeSnapshot } from './engine-test-utils';

function book(id: string, title: string, planOrder: number, owned = true): BookRecord {
  return {
    ...EXAMPLE_BOOK,
    id,
    title,
    short: title,
    pages: 40,
    subjects: [title],
    manualSeedDifficulty: 5,
    owned,
    planOrder,
    enrichment: {
      chapters: [title],
      description: title,
      olSubjects: [title],
      tocSource: 'manual',
    },
  };
}

function project(): PlannerProjectV1 {
  return {
    version: 1,
    library: {
      books: {
        a: book('a', 'Alpha', 2),
        b: book('b', 'Beta', 1, false),
        c: book('c', 'Gamma', 0),
      },
    },
    manualOverrides: { schedule: {}, deferred: {}, actuals: {} },
    constraints: {
      ...DEFAULT_CONSTRAINTS,
      sd: '2026-01-05',
      par: 2,
      hpd: 8,
      minPg: 5,
      maxPg: 20,
      bmp: 1,
      schedAlgo: 'balanced',
      applyOverlapSkim: false,
      mutualEnabled: false,
    },
    enrichmentCache: {},
    sourceSettings: createDefaultSourceSettings(),
    uiPreferences: { ganttView: 'plan', ganttZoom: 1, planColorMode: 'category_mono' },
  };
}

describe('book order policy', () => {
  it('prefers owned books and explicit library order when requested', () => {
    const input = project();
    input.constraints.bookOrderPolicy = 'prefer';

    const snapshot = computeSnapshot(input);

    expect(snapshot.schedulePlan.byId.c.scheduleRank).toBeLessThan(
      snapshot.schedulePlan.byId.a.scheduleRank,
    );
    expect(snapshot.schedulePlan.byId.a.scheduleRank).toBeLessThan(
      snapshot.schedulePlan.byId.b.scheduleRank,
    );
  });

  it('enforces list order as an N-wide predecessor chain', () => {
    const input = project();
    input.constraints.bookOrderPolicy = 'enforce';

    const snapshot = computeSnapshot(input);

    expect(snapshot.schedulePlan.prereqById.b).toContain('c');
    expect(snapshot.schedulePlan.prereqById.a).not.toContain('c');
  });
});
