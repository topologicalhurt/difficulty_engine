import {
  DEFAULT_CONSTRAINTS,
  createDefaultAiRecommendationSettings,
  createDefaultSourceSettings,
} from '../../src/core/defaults';
import type {
  BookRecord,
  PlannerProjectV1,
  ScheduleAlgorithm,
} from '../../src/core/types';

export function makeProject(): PlannerProjectV1 {
  return {
    version: 1,
    library: {
      books: {
        intro: {
          id: 'intro',
          title: 'Introduction to Linear Algebra',
          short: 'Intro LA',
          authors: ['A. Author'],
          displayGroup: 'Core',
          manualSeedDifficulty: 3,
          pages: 220,
          subjects: ['linear algebra', 'vectors', 'matrices'],
          publisher: '',
          isbn: null,
          year: null,
          manualPrereqs: [],
          manualCoStudy: [],
          owned: true,
          planOrder: 0,
          allowPrereqOverlap: false,
          lockDiff: false,
          noPropOut: false,
          ignored: false,
          constantRD: false,
          completed: false,
          enrichment: {
            chapters: ['Vectors and matrices', 'Linear systems', 'Eigenvalues'],
            description:
              'A first course in vectors, matrices, linear systems, and eigenvalues.',
            olSubjects: ['linear algebra'],
            tocSource: 'manual',
          },
        },
        advanced: {
          id: 'advanced',
          title: 'Applied Linear Algebra and Optimization',
          short: 'Applied LA',
          authors: ['A. Author'],
          displayGroup: 'Applied',
          manualSeedDifficulty: 6,
          pages: 420,
          subjects: ['linear algebra', 'optimization', 'matrix methods'],
          publisher: '',
          isbn: null,
          year: null,
          manualPrereqs: [],
          manualCoStudy: [],
          owned: true,
          planOrder: 1,
          allowPrereqOverlap: false,
          lockDiff: false,
          noPropOut: false,
          ignored: false,
          constantRD: false,
          completed: false,
          enrichment: {
            chapters: [
              'Review of vector spaces',
              'Advanced matrix decompositions',
              'Convex optimization',
            ],
            description:
              'Builds on vector spaces and matrix methods before moving into optimization.',
            olSubjects: ['optimization'],
            tocSource: 'manual',
          },
        },
      },
    },
    manualOverrides: { schedule: {}, deferred: {}, actuals: {} },
    constraints: { ...DEFAULT_CONSTRAINTS, par: 2, hpd: 2.5, sd: '2026-01-05' },
    aiRecommendationSettings: createDefaultAiRecommendationSettings(),
    sourceSettings: createDefaultSourceSettings(),
    enrichmentCache: {},
    uiPreferences: {
      ganttView: 'plan',
      ganttZoom: 1,
      planColorMode: 'category_mono',
    },
  };
}

export function makeSchedulerModeProject(
  algorithm: ScheduleAlgorithm,
): PlannerProjectV1 {
  const project = makeProject();
  const base = project.library.books.intro;
  const makeBook = (
    id: string,
    title: string,
    difficulty: number,
    prereqs: string[] = [],
  ): BookRecord => ({
    ...base,
    id,
    title,
    short: title,
    authors: [`${title} Author`],
    manualSeedDifficulty: difficulty,
    pages: 40,
    subjects: [`${id} subject`],
    manualPrereqs: prereqs,
    manualCoStudy: [],
    owned: true,
    planOrder: title.charCodeAt(0),
    enrichment: {
      ...base.enrichment,
      chapters: [`${title} chapter`],
      description: `${title} material.`,
      olSubjects: [`${id} subject`],
    },
  });
  project.library.books = {
    a_filler: makeBook('a_filler', 'A Filler', 9),
    b_filler: makeBook('b_filler', 'B Filler', 9),
    z_parent: makeBook('z_parent', 'Z Parent', 2),
    z_child: makeBook('z_child', 'Z Child', 2, ['z_parent']),
  };
  project.constraints = {
    ...project.constraints,
    schedAlgo: algorithm,
    feasibilityMode: 'strict_floor',
    backfillMode: 'global',
    prereqMode: 'strict',
    par: 2,
    hpd: 8,
    dpw: 7,
    minPg: 10,
    maxPg: 10,
    bmp: 1,
    gam: 1,
    applyOverlapSkim: false,
    boostUnused: false,
    mutualEnabled: false,
  };
  return project;
}
