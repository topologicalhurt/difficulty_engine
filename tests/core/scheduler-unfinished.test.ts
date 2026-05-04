import { describe, expect, it } from 'vitest';

import { DEFAULT_CONSTRAINTS, createDefaultSourceSettings } from '../../src/core/defaults';
import type { BookRecord, PlannerProjectV1 } from '../../src/core/types';
import { computeSnapshot } from './engine-test-utils';

function book(id: string, title: string, mutuals: string[] = []): BookRecord {
  return {
    id,
    title,
    short: title,
    authors: [`${title} Author`],
    displayGroup: 'Core',
    manualSeedDifficulty: 5,
    pages: 100,
    subjects: [`${title} topic`],
    publisher: '',
    isbn: null,
    year: null,
    sourcePath: null,
    openLibraryKey: null,
    openLibraryEditionKey: null,
    openLibraryWorkKey: null,
    googleBooksId: null,
    manualPrereqs: [],
    manualCoStudy: mutuals,
    owned: true,
    planOrder: id.charCodeAt(0),
    allowPrereqOverlap: false,
    lockDiff: false,
    noPropOut: false,
    ignored: false,
    constantRD: false,
    completed: false,
    enrichment: {
      chapters: [`${title} chapter`],
      description: `${title} material.`,
      olSubjects: [`${title} topic`],
      tocSource: 'manual',
    },
  };
}

function projectWithSynchronizedGroup(): PlannerProjectV1 {
  return {
    version: 1,
    library: {
      books: {
        a: book('a', 'Alpha', ['b', 'c']),
        b: book('b', 'Beta', ['a', 'c']),
        c: book('c', 'Gamma', ['a', 'b']),
      },
    },
    manualOverrides: { schedule: {}, deferred: {}, actuals: {} },
    constraints: {
      ...DEFAULT_CONSTRAINTS,
      sd: '2026-01-05',
      par: 3,
      hpd: 2,
      dpw: 7,
      minPg: 5,
      maxPg: 10,
      bmp: 20,
      feasibilityMode: 'strict_floor',
      backfillMode: 'global',
      prereqMode: 'strict',
      schedAlgo: 'balanced',
      mutualEnabled: true,
      mutualOversize: 'strict',
      applyOverlapSkim: false,
      boostUnused: false,
    },
    enrichmentCache: {},
    sourceSettings: createDefaultSourceSettings(),
    uiPreferences: { ganttView: 'plan', ganttZoom: 1, planColorMode: 'category_mono' },
  };
}

describe('unfinished scheduler invariants', () => {
  it('marks unallocatable pending work with blocker reasons instead of silently advancing', () => {
    const snapshot = computeSnapshot(projectWithSynchronizedGroup());
    const unfinished = Object.values(snapshot.dayPlan.byBookStats).filter(
      (entry) => entry.unfinishedPages > 0.01,
    );

    expect(snapshot.scheduleStats.finishDate).toBeUndefined();
    expect(snapshot.scheduleStats.unfinishedBooks).toBe(unfinished.length);
    expect(snapshot.scheduleStats.blockedBooks).toBe(unfinished.length);
    expect(unfinished).not.toHaveLength(0);
    unfinished.forEach((entry) => {
      expect(entry.blockedReason || entry.infeasibleReason || entry.hardInfeasible).toBeTruthy();
    });
    expect(
      snapshot.renderModel.warnings.some(
        (warning) =>
          warning.code === 'unfinished-books' &&
          warning.relatedIds?.length === snapshot.scheduleStats.unfinishedBooks,
      ),
    ).toBe(true);
    expect(
      snapshot.diagnostics.warns.some((message) =>
        message.includes(`${snapshot.scheduleStats.unfinishedBooks} scheduled book(s)`),
      ),
    ).toBe(true);
  });

  it('does not report unexplained unfinished work in canonical snapshots', () => {
    const snapshot = computeSnapshot(projectWithSynchronizedGroup());
    const unexplained = Object.values(snapshot.dayPlan.byBookStats).filter(
      (entry) =>
        entry.unfinishedPages > 0.01 &&
        !entry.blockedReason &&
        !entry.infeasibleReason &&
        !entry.hardInfeasible,
    );

    expect(unexplained).toHaveLength(0);
    expect(
      snapshot.renderModel.warnings.some(
        (warning) => warning.code === 'unfinished-books' && warning.severity === 'fail',
      ),
    ).toBe(false);
  });
});
