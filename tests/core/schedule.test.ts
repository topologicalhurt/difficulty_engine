import { describe, expect, it } from 'vitest';

import { buildTopicIndex, extractCorpus } from '../../src/core/corpus';
import {
  DEFAULT_CONSTRAINTS,
  EXAMPLE_BOOK,
  createDefaultAiRecommendationSettings,
  createDefaultSourceSettings,
} from '../../src/core/defaults';
import { computeDifficultyModel } from '../../src/core/difficulty';
import { inferRelations } from '../../src/core/relations';
import { solveSchedule } from '../../src/core/schedule';
import { buildWorkloadClusters } from '../../src/core/workload-clusters';
import type {
  BookRecord,
  PlannerProjectV1,
  ScheduleAlgorithm,
  SchedulePlan,
} from '../../src/core/types';

function makeBook(
  id: string,
  index: number,
  patch: Partial<BookRecord> = {},
): BookRecord {
  const title = patch.title || `Book ${index}`;
  return {
    ...EXAMPLE_BOOK,
    id,
    title,
    short: title,
    authors: [`Author ${index}`],
    pages: 60,
    subjects: [`subject ${id}`],
    manualSeedDifficulty: 5 + index * 0.1,
    manualPrereqs: [],
    manualCoStudy: [],
    owned: true,
    planOrder: index,
    ignored: false,
    constantRD: false,
    completed: false,
    enrichment: {
      chapters: [`${title} chapter`],
      description: `${title} standalone material.`,
      olSubjects: [`subject ${id}`],
      tocSource: 'manual',
    },
    ...patch,
  };
}

function makeProject(
  books: BookRecord[],
  constraints: Partial<PlannerProjectV1['constraints']> = {},
  schedule: PlannerProjectV1['manualOverrides']['schedule'] = {},
): PlannerProjectV1 {
  return {
    version: 1,
    library: {
      books: Object.fromEntries(books.map((book) => [book.id, book])),
    },
    manualOverrides: { schedule, deferred: {}, actuals: {} },
    constraints: {
      ...DEFAULT_CONSTRAINTS,
      sd: '2026-01-05',
      par: 2,
      hpd: 8,
      dpw: 7,
      minPg: 5,
      maxPg: 20,
      bmp: 1,
      gam: 1,
      mutualEnabled: false,
      applyOverlapSkim: false,
      boostUnused: false,
      autoRD: false,
      ...constraints,
    },
    aiRecommendationSettings: createDefaultAiRecommendationSettings(),
    enrichmentCache: {},
    sourceSettings: createDefaultSourceSettings(),
    uiPreferences: {
      ganttView: 'plan',
      ganttZoom: 1,
      planColorMode: 'category_mono',
    },
  };
}

function solveProject(project: PlannerProjectV1): SchedulePlan {
  const corpus = extractCorpus(project);
  const topicIndex = buildTopicIndex(corpus);
  const relationInfo = inferRelations(corpus, topicIndex, project);
  const workloadClusterInfo = buildWorkloadClusters(
    corpus,
    topicIndex,
    relationInfo,
  );
  const difficultyModel = computeDifficultyModel(
    corpus,
    topicIndex,
    relationInfo,
    project,
    workloadClusterInfo,
  );
  return solveSchedule(project, corpus, relationInfo, difficultyModel);
}

function expectScheduleInvariants(plan: SchedulePlan): void {
  const activeIds = new Set(plan.activeIds);
  plan.items.forEach((item) => {
    expect(activeIds.has(item.id)).toBe(true);
    item.prereqs.forEach((parent) => {
      expect(activeIds.has(parent)).toBe(true);
    });
    if (item.lanePrevId) {
      const previous = plan.byId[item.lanePrevId];
      expect(previous?.lane).toBe(item.lane);
      expect(previous?.de).toBeLessThanOrEqual(item.ds);
    }
    if (item.coStudyGroup) {
      expect(plan.coStudyMeta.lookup[item.id]).toBe(item.coStudyGroup);
    }
  });
  plan.coStudyMeta.groups.forEach((group) => {
    group.ids.forEach((id) => {
      expect(plan.coStudyMeta.lookup[id]).toBe(group.id);
    });
  });
}

describe('solveSchedule', () => {
  it('filters ignored, completed, and research-background books before scheduling', () => {
    const project = makeProject(
      [
        makeBook('active', 0),
        makeBook('ignored', 1, { ignored: true }),
        makeBook('completed', 2, { completed: true }),
        makeBook('background', 3, { constantRD: true }),
      ],
      { excComp: true },
    );

    const plan = solveProject(project);

    expect(plan.activeIds).toEqual(['active']);
    expect(Object.keys(plan.byId)).toEqual(['active']);
    expectScheduleInvariants(plan);
  });

  it('injects enforced book-order prerequisites as a deterministic N-wide chain', () => {
    const plan = solveProject(
      makeProject(
        [
          makeBook('a', 0),
          makeBook('b', 1),
          makeBook('c', 2),
          makeBook('d', 3),
        ],
        { bookOrderPolicy: 'enforce', par: 2 },
      ),
    );

    expect(plan.prereqById.c).toContain('a');
    expect(plan.prereqById.d).toContain('b');
    expect(plan.prereqById.b).not.toContain('a');
    expectScheduleInvariants(plan);
  });

  it('annotates lane predecessors only from earlier items in the same preserved lane', () => {
    const plan = solveProject(
      makeProject([makeBook('a', 0), makeBook('b', 1), makeBook('c', 2)], {
        backfillMode: 'lane_preserving',
        par: 1,
      }),
    );

    expect(plan.items.some((item) => item.lanePrevId)).toBe(true);
    expect(plan.items.every((item) => item.laneEnforced)).toBe(true);
    expectScheduleInvariants(plan);
  });

  it('keeps flexible visual lanes separate from enforced lane gates', () => {
    const plan = solveProject(
      makeProject([makeBook('a', 0), makeBook('b', 1), makeBook('c', 2)], {
        backfillMode: 'global',
        par: 2,
      }),
    );

    expect(plan.items.every((item) => item.laneEnforced === false)).toBe(true);
    expectScheduleInvariants(plan);
  });

  it('surfaces manual start conflicts caused by prerequisites', () => {
    const plan = solveProject(
      makeProject(
        [
          makeBook('parent', 0),
          makeBook('child', 1, { manualPrereqs: ['parent'] }),
        ],
        { backfillMode: 'global' },
        { child: { ds: 0 } },
      ),
    );

    expect(plan.byId.child.ds).toBeGreaterThan(plan.byId.parent.ds);
    expect(plan.byId.child.manualWindowImpossibleReason).toContain(
      'cannot honor the manual start window',
    );
    expectScheduleInvariants(plan);
  });

  it('keeps co-study starts together without erasing prerequisite truth', () => {
    const plan = solveProject(
      makeProject(
        [
          makeBook('parent', 0),
          makeBook('a', 1, { manualCoStudy: ['b'] }),
          makeBook('b', 2, { manualPrereqs: ['parent'] }),
        ],
        { mutualEnabled: true, par: 3 },
      ),
    );

    expect(plan.byId.a.coStudyGroup).toBe(plan.byId.b.coStudyGroup);
    expect(plan.byId.a.coStudyGroup).not.toBeNull();
    expect(plan.byId.a.ds).toBe(plan.byId.b.ds);
    expect(plan.prereqById.b).toContain('parent');
    expectScheduleInvariants(plan);
  });

  it('splits oversized co-study groups into deterministic batches when allowed', () => {
    const books = [
      makeBook('a', 0, { manualCoStudy: ['b', 'c', 'd'] }),
      makeBook('b', 1),
      makeBook('c', 2),
      makeBook('d', 3),
    ];
    const plan = solveProject(
      makeProject(books, {
        mutualEnabled: true,
        mutualOversize: 'batch',
        par: 2,
      }),
    );
    const groups = plan.items.map((item) => item.coStudyGroup);

    expect(new Set(groups).size).toBe(2);
    expect(groups).toContain('g0:batch0');
    expect(groups).toContain('g0:batch1');
    expect(
      plan.items.filter((item) => item.coStudyGroup === 'g0:batch0'),
    ).toHaveLength(2);
    expect(
      plan.items.filter((item) => item.coStudyGroup === 'g0:batch1'),
    ).toHaveLength(2);
    expectScheduleInvariants(plan);
  });

  it('is deterministic for each scheduler algorithm', () => {
    const algorithms: ScheduleAlgorithm[] = [
      'balanced',
      'critical',
      'fastest',
      'greedy',
    ];
    algorithms.forEach((algorithm) => {
      const project = makeProject(
        [
          makeBook('a', 0, { manualSeedDifficulty: 8 }),
          makeBook('b', 1, { manualSeedDifficulty: 3 }),
          makeBook('c', 2, { manualSeedDifficulty: 6, manualPrereqs: ['b'] }),
        ],
        { schedAlgo: algorithm, par: 2 },
      );

      const first = solveProject(project);
      const second = solveProject(project);
      expect(
        first.items.map((item) => [
          item.id,
          item.scheduleRank,
          item.ds,
          item.de,
        ]),
      ).toEqual(
        second.items.map((item) => [
          item.id,
          item.scheduleRank,
          item.ds,
          item.de,
        ]),
      );
      expectScheduleInvariants(first);
    });
  });
});
