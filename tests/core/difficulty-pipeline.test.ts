import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CONSTRAINTS,
  EXAMPLE_BOOK,
  createDefaultAiRecommendationSettings,
  createDefaultSourceSettings,
  createDefaultUiPreferences,
} from '../../src/core/defaults';
import type {
  BookRecord,
  ConstraintSet,
  PlannerProjectV1,
} from '../../src/core/types';
import { computeSnapshot } from './engine-test-utils';

function chapters(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    return `${prefix} chapter ${index + 1}`;
  });
}

function book(
  id: string,
  title: string,
  seed: number,
  patch: Partial<BookRecord> = {},
): BookRecord {
  const subjects = patch.subjects ?? [
    title,
    'technical systems',
    seed > 6 ? 'advanced methods' : 'foundations',
  ];
  return {
    ...EXAMPLE_BOOK,
    id,
    title,
    short: title,
    manualSeedDifficulty: seed,
    lockDiff: patch.lockDiff ?? false,
    pages: patch.pages ?? 180 + seed * 45,
    subjects,
    manualPrereqs: patch.manualPrereqs ?? [],
    manualCoStudy: patch.manualCoStudy ?? [],
    enrichment: {
      chapters:
        patch.enrichment?.chapters ??
        chapters(title, seed > 6 ? 14 : seed > 4 ? 9 : 5),
      description:
        patch.enrichment?.description ??
        `${title} covers ${subjects.join(' ')} with worked exercises, applications, and technical examples.`,
      olSubjects: patch.enrichment?.olSubjects ?? subjects,
      tocSource: patch.enrichment?.tocSource ?? 'manual',
      provenance: patch.enrichment?.provenance ?? {
        chapters: {
          provider: 'fixture',
          fetchedAt: '2026-01-05T00:00:00.000Z',
          confidence: 0.9,
        },
      },
    },
    ...patch,
  };
}

function project(
  patch: Partial<ConstraintSet> = {},
  projectPatch: Partial<PlannerProjectV1> = {},
): PlannerProjectV1 {
  return {
    version: 1,
    library: {
      books: {
        intro: book('intro', 'Intro Foundations', 2.4, {
          pages: 140,
          subjects: ['foundations', 'introductory techniques'],
        }),
        systems: book('systems', 'Systems Practice', 5.2, {
          pages: 320,
          manualPrereqs: ['intro'],
          subjects: ['systems', 'technical systems', 'practice'],
        }),
        advanced: book('advanced', 'Advanced Synthesis', 8.4, {
          pages: 620,
          manualPrereqs: ['systems'],
          subjects: [
            'advanced methods',
            'technical systems',
            'synthesis',
            'optimization',
          ],
        }),
      },
    },
    manualOverrides: { schedule: {}, deferred: {}, actuals: {} },
    constraints: {
      ...DEFAULT_CONSTRAINTS,
      sd: '2026-01-05',
      hpd: 8,
      minPg: 4,
      maxPg: 80,
      bmp: 8,
      gam: 1,
      par: 1,
      applyOverlapSkim: false,
      boostUnused: false,
      ...patch,
    },
    aiRecommendationSettings: createDefaultAiRecommendationSettings(),
    enrichmentCache: {},
    sourceSettings: createDefaultSourceSettings(),
    uiPreferences: createDefaultUiPreferences(),
    ...projectPatch,
  };
}

function spread(values: number[]): number {
  return Math.max(...values) - Math.min(...values);
}

describe('latent difficulty pipeline', () => {
  it('exposes latent workload, evidence confidence, and planner/display split', () => {
    const snapshot = computeSnapshot(project({ diffMapMode: 'raw' }));
    const values = Object.values(snapshot.difficultyModel).map(
      (entry) => entry.scheduleDifficulty,
    );
    const intro = snapshot.difficultyModel.intro;
    const advanced = snapshot.difficultyModel.advanced;

    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(1);
    expect(advanced.latentWorkload).toBeGreaterThan(intro.latentWorkload);
    expect(advanced.evidenceConfidence).toBeGreaterThan(0.5);
    expect(advanced.workloadUncertainty).toBeLessThan(0.6);
    expect(advanced.difficultyEvidence.length).toBeGreaterThan(2);
    expect(advanced.explanation.join(' ')).toContain(
      'Schedule difficulty',
    );
  });

  it('lets learner profiles change desired pacing before feasibility clamps', () => {
    const confidenceBuilder = computeSnapshot(
      project({
        learnerProfileMode: 'confidence_builder',
        relativePacingStrength: 50,
        targetChallenge: 55,
      }),
    ).schedulePlan.byId.intro;
    const fastTrack = computeSnapshot(
      project({
        learnerProfileMode: 'fast_track',
        relativePacingStrength: 50,
        targetChallenge: 55,
      }),
    ).schedulePlan.byId.intro;

    expect(fastTrack.desiredPagesPerDay).toBeGreaterThan(
      confidenceBuilder.desiredPagesPerDay,
    );
    expect(fastTrack.feasibleMinPagesPerDay).toBe(
      confidenceBuilder.feasibleMinPagesPerDay,
    );
  });

  it('keeps manual difficulty locks authoritative over graph propagation', () => {
    const input = project({
      propMix: 1,
      damp: 0,
      alphaCap: 1,
      absFloor: 10,
      propLiftCap: 10,
    });
    input.library.books.advanced.lockDiff = true;
    input.library.books.advanced.manualSeedDifficulty = 4;

    const locked = computeSnapshot(input).difficultyModel.advanced;

    expect(locked.scheduleDifficulty).toBe(4);
    expect(locked.graphWorkloadLift).toBe(0);
    expect(locked.learnerCalibrationLift).toBe(0);
    expect(locked.difficultyBindingReason).toBe('manual_lock');
  });

  it('makes pacing sliders materially responsive under adaptive profiles', () => {
    const lowSpread = computeSnapshot(
      project({
        learnerProfileMode: 'balanced_adaptive',
        relativePacingStrength: 0,
        hpd: 8,
        minPg: 2,
        maxPg: 80,
        bmp: 1,
        gam: 1,
        boostUnused: false,
      }),
    ).schedulePlan.items.map((item) => item.pacingPageTarget);
    const highSpread = computeSnapshot(
      project({
        learnerProfileMode: 'balanced_adaptive',
        relativePacingStrength: 100,
        hpd: 8,
        minPg: 2,
        maxPg: 80,
        bmp: 1,
        gam: 1,
        boostUnused: false,
      }),
    ).schedulePlan.items.map((item) => item.pacingPageTarget);

    expect(spread(highSpread)).toBeGreaterThan(spread(lowSpread));
  });

  it('recalibrates from logged actuals only after enough pages exist', () => {
    const sparse = computeSnapshot(
      project(
        { learnerAdaptivityStrength: 100 },
        {
          manualOverrides: {
            schedule: {},
            deferred: {},
            actuals: {
              '2026-01-05': {
                advanced: { minutes: 600, pages: 10, done: true },
              },
            },
          },
        },
      ),
    ).difficultyModel.advanced;
    const logged = computeSnapshot(
      project(
        { learnerAdaptivityStrength: 100 },
        {
          manualOverrides: {
            schedule: {},
            deferred: {},
            actuals: {
              '2026-01-05': {
                advanced: { minutes: 4000, pages: 100, done: true },
              },
            },
          },
        },
      ),
    ).difficultyModel.advanced;

    expect(sparse.learnerCalibrationLift).toBe(0);
    expect(logged.learnerCalibrationLift).toBeGreaterThan(0);
    expect(logged.difficultyBindingReason).toBe('learner_calibrated');
  });

  it('records strict-floor binding instead of hiding lost pacing variation', () => {
    const snapshot = computeSnapshot(
      project({
        learnerProfileMode: 'manual',
        targetChallenge: 0,
        relativePacingStrength: 0,
        feasibilityMode: 'strict_floor',
        minPg: 20,
        maxPg: 40,
        bmp: 20,
        gam: 1,
      }),
    );
    const item = snapshot.schedulePlan.byId.systems;

    expect(item.desiredPagesPerDay).toBeLessThan(item.finalPagesPerDay);
    expect(item.pacingBindingReason).toBe('floor_bound');
    expect(
      snapshot.renderModel.warnings.some(
        (warning) => warning.code === 'pacing-floor-bound',
      ),
    ).toBe(true);
  });

  it('reports low raw variance instead of pretending raw mode is expressive', () => {
    const snapshot = computeSnapshot(
      project(
        { diffMapMode: 'raw' },
        {
          library: {
            books: {
              a: book('a', 'Cluster A', 5, { lockDiff: true }),
              b: book('b', 'Cluster B', 5.1, { lockDiff: true }),
              c: book('c', 'Cluster C', 5.2, { lockDiff: true }),
            },
          },
        },
      ),
    );

    expect(
      snapshot.renderModel.warnings.some(
        (warning) => warning.code === 'low-raw-difficulty-variance',
      ),
    ).toBe(true);
  });
});
