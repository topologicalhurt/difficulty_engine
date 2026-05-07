import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CONSTRAINTS,
  DEFAULT_UI_STATE,
  createDefaultAiRecommendationSettings,
  createDefaultSourceSettings,
  createDefaultUiPreferences,
} from '../../src/core/defaults';
import { createPlannerEngine } from '../../src/core/engine';
import { plannerClock } from '../../src/core/time';
import type {
  AppState,
  BookRecord,
  Logger,
  PlannerProjectV1,
} from '../../src/core/types';
import {
  visibleCoStudyGroups,
  visibleDisplayGroupPartitions,
  visibleGraphBookIds,
  visiblePrerequisiteEdges,
} from '../../src/app/selectors/graph-render-data';

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function book(
  id: string,
  prereqs: string[] = [],
  coStudy: string[] = [],
): BookRecord {
  return {
    id,
    title: id,
    short: id,
    authors: [],
    displayGroup: id.startsWith('a') ? 'A' : 'B',
    manualSeedDifficulty: 5,
    pages: 80,
    subjects: [id],
    publisher: '',
    isbn: null,
    year: null,
    manualPrereqs: prereqs,
    manualCoStudy: coStudy,
    owned: true,
    planOrder: id.charCodeAt(0),
    allowPrereqOverlap: false,
    lockDiff: false,
    noPropOut: false,
    ignored: false,
    constantRD: false,
    completed: false,
    enrichment: {
      chapters: [`${id} chapter`],
      description: `${id} description`,
      olSubjects: [id],
      tocSource: 'manual',
    },
  };
}

function graphState(
  projectPatch: Partial<PlannerProjectV1['constraints']> = {},
): AppState {
  const project: PlannerProjectV1 = {
    version: 1,
    library: {
      books: {
        a: book('a', [], ['b']),
        b: book('b', ['a'], ['a']),
        c: { ...book('c', ['a', 'b']), completed: true },
      },
    },
    manualOverrides: { schedule: {}, deferred: {}, actuals: {} },
    constraints: {
      ...DEFAULT_CONSTRAINTS,
      sd: '2026-01-05',
      tr: true,
      part: false,
      excComp: true,
      mutualEnabled: true,
      ...projectPatch,
    } as PlannerProjectV1['constraints'],
    enrichmentCache: {},
    aiRecommendationSettings: createDefaultAiRecommendationSettings(),
    sourceSettings: createDefaultSourceSettings(),
    uiPreferences: createDefaultUiPreferences(),
  };
  const snapshot = createPlannerEngine({
    clock: plannerClock,
    logger: silentLogger,
  }).computeSnapshot(project);
  return {
    project,
    snapshot,
    ui: { ...DEFAULT_UI_STATE },
    enrichment: { byBookId: {} },
    performance: {
      projectRevision: 0,
      uiRevision: 0,
      snapshotRevision: 0,
      lastSnapshotMs: 0,
      lastRenderMs: 0,
      lastWorkerMs: 0,
    },
  };
}

describe('graph render data', () => {
  it('applies graph settings to visible graph data', () => {
    const reduced = graphState({ tr: true, excComp: false });
    const full = graphState({ tr: false, excComp: false });
    const excludedCompleted = graphState({ tr: false, excComp: true });
    const noCoStudy = graphState({ mutualEnabled: false });
    const partitioned = graphState({ part: true });

    expect(visiblePrerequisiteEdges(reduced)).toHaveLength(2);
    expect(visiblePrerequisiteEdges(full)).toHaveLength(3);
    expect(visibleGraphBookIds(excludedCompleted)).not.toContain('c');
    expect(visibleCoStudyGroups(noCoStudy)).toHaveLength(0);
    expect(visibleDisplayGroupPartitions(partitioned).length).toBeGreaterThan(
      0,
    );
  });
});
