import { describe, expect, it } from 'vitest';

import { createPlannerEngine } from '../../src/core/engine';
import {
  DEFAULT_CONSTRAINTS,
  EXAMPLE_BOOK,
  createDefaultSourceSettings,
} from '../../src/core/defaults';
import type { PlannerProjectV1 } from '../../src/core/types';

function characterizationProject(): PlannerProjectV1 {
  return {
    version: 1,
    library: {
      books: {
        foundations: {
          ...EXAMPLE_BOOK,
          id: 'foundations',
          title: 'Foundations of Test Planning',
          short: 'Foundations',
          manualSeedDifficulty: 3,
          pages: 120,
          subjects: ['planning', 'systems'],
          manualPrereqs: [],
          manualCoStudy: [],
          planOrder: 0,
          enrichment: {
            chapters: ['Planning basics', 'Systems overview', 'Review'],
            description: 'A first course in planning basics and systems overview.',
            olSubjects: ['planning'],
            tocSource: 'manual',
          },
        },
        advanced: {
          ...EXAMPLE_BOOK,
          id: 'advanced',
          title: 'Advanced Test Planning Systems',
          short: 'Advanced',
          manualSeedDifficulty: 7,
          pages: 160,
          subjects: ['planning', 'systems', 'advanced methods'],
          manualPrereqs: ['foundations'],
          manualCoStudy: ['parallel'],
          planOrder: 1,
          enrichment: {
            chapters: ['Advanced methods', 'Systems integration', 'Planning review'],
            description: 'Advanced methods that build on planning basics and systems overview.',
            olSubjects: ['systems'],
            tocSource: 'manual',
          },
        },
        parallel: {
          ...EXAMPLE_BOOK,
          id: 'parallel',
          title: 'Parallel Practice Workbook',
          short: 'Parallel',
          manualSeedDifficulty: 5,
          pages: 90,
          subjects: ['practice', 'systems'],
          manualPrereqs: [],
          manualCoStudy: ['advanced'],
          planOrder: 2,
          enrichment: {
            chapters: ['Practice sets', 'Systems exercises'],
            description: 'Practice workbook for systems exercises.',
            olSubjects: ['practice'],
            tocSource: 'manual',
          },
        },
      },
    },
    manualOverrides: { schedule: {}, deferred: {}, actuals: {} },
    constraints: {
      ...DEFAULT_CONSTRAINTS,
      sd: '2026-01-05',
      par: 2,
      hpd: 8,
      dpw: 5,
      minPg: 1,
      maxPg: 20,
      bmp: 5,
      gam: 1,
      feasibilityMode: 'strict_floor',
      applyOverlapSkim: false,
    },
    sourceSettings: createDefaultSourceSettings(),
    enrichmentCache: {},
    uiPreferences: { ganttView: 'plan', ganttZoom: 1, planColorMode: 'category_mono' },
  };
}

describe('refactor characterization', () => {
  it('keeps the canonical engine snapshot deterministic for a mixed relation fixture', () => {
    const engine = createPlannerEngine();
    const project = characterizationProject();
    const first = engine.computeSnapshot(project);
    const second = engine.computeSnapshot(project);

    expect(second).toEqual(first);
    expect(first.schedulePlan.items.map((item) => item.id)).toEqual([
      'foundations',
      'parallel',
      'advanced',
    ]);
    expect(first.graphPrereqsById.advanced).toContain('foundations');
    expect(first.relations).toContainEqual(expect.objectContaining({
      from: 'advanced',
      to: 'parallel',
      type: 'co-study',
    }));
    expect(Object.values(first.dayPlan.byBookStats).every((stat) => stat.unfinishedPages === 0)).toBe(true);
    expect(first.scheduleStats.finishDate).toBeTruthy();
  });
});
