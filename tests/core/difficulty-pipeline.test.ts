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

  it('separates subtle technical evidence without display-only scaling', () => {
    const snapshot = computeSnapshot(
      project(
        { diffMapMode: 'raw' },
        {
          library: {
            books: {
              notes: book('notes', 'Workshop Notes', 5, {
                pages: 90,
                subjects: ['basic workshop notes'],
                enrichment: {
                  chapters: chapters('notes', 3),
                  description: 'Short practical overview.',
                  olSubjects: ['basic workshop notes'],
                  tocSource: 'manual',
                },
              }),
              circuits: book('circuits', 'Circuit Analysis', 5, {
                pages: 280,
                subjects: ['circuit analysis', 'electronics'],
                enrichment: {
                  chapters: chapters('circuits', 8),
                  description:
                    'Circuit analysis with examples and worked exercises.',
                  olSubjects: ['circuit analysis', 'electronics'],
                  tocSource: 'manual',
                },
              }),
              dsp: book('dsp', 'Discrete-Time Signal Processing', 5, {
                pages: 520,
                subjects: [
                  'discrete-time signal processing',
                  'fourier analysis',
                  'digital filters',
                  'z transforms',
                  'spectral estimation',
                ],
                enrichment: {
                  chapters: chapters('dsp', 15),
                  description:
                    'Dense technical treatment with proofs, problems, applications, and signal processing projects.',
                  olSubjects: [
                    'discrete-time signal processing',
                    'fourier analysis',
                    'digital filters',
                  ],
                  tocSource: 'manual',
                },
              }),
            },
          },
        },
      ),
    );
    const values = Object.values(snapshot.difficultyModel).map(
      (entry) => entry.scheduleDifficulty,
    );

    expect(spread(values)).toBeGreaterThan(0.3);
    expect(snapshot.difficultyModel.dsp.scheduleDifficulty).toBeGreaterThan(
      snapshot.difficultyModel.notes.scheduleDifficulty,
    );
    expect(snapshot.difficultyModel.dsp.difficultyEvidence.join(' ')).toContain(
      'Evidence-calibrated cohort prior',
    );
  });

  it('skips trusted learned non-core sections without mutating source chapters', () => {
    const snapshot = computeSnapshot(
      project(
        {},
        {
          library: {
            books: {
              scoped: book('scoped', 'Scoped Technical Book', 5, {
                pages: 600,
                enrichment: {
                  chapters: [
                    'Preface',
                    'Contents',
                    'Foundations',
                    'Core Methods',
                    'Applications',
                    'Appendix A Reference Tables',
                    'Bibliography',
                    'Index',
                  ],
                  description: 'Dense technical material with examples.',
                  olSubjects: ['technical methods'],
                  tocSource: 'pdf',
                },
              }),
            },
          },
        },
      ),
    );

    expect(snapshot.difficultyModel.scoped.physicalPages).toBe(600);
    expect(snapshot.difficultyModel.scoped.effectiveReadingPages).toBeLessThan(
      600,
    );
    expect(snapshot.schedulePlan.byId.scoped.pages).toBe(
      snapshot.difficultyModel.scoped.effectiveReadingPages,
    );
    expect(
      snapshot.difficultyModel.scoped.difficultyEvidence.join(' '),
    ).toContain('Effective reading pages');
  });

  it('uses intro/expert title cues only inside a same-topic cohort', () => {
    const snapshot = computeSnapshot(
      project(
        { diffMapMode: 'raw' },
        {
          library: {
            books: {
              lie: book('lie', 'Introduction to Lie Theory', 5, {
                pages: 520,
                subjects: [
                  'lie theory',
                  'lie algebras',
                  'representation theory',
                ],
                enrichment: {
                  chapters: chapters('lie algebra', 12),
                  description:
                    'Lie algebras, representation theory, root systems, and advanced algebraic structure.',
                  olSubjects: ['lie theory', 'representation theory'],
                  tocSource: 'manual',
                },
              }),
              workshop: book('workshop', 'Workshop Primer', 5, {
                pages: 110,
                subjects: ['basic workshop'],
                enrichment: {
                  chapters: chapters('workshop', 4),
                  description: 'Short practical overview.',
                  olSubjects: ['basic workshop'],
                  tocSource: 'manual',
                },
              }),
              introCircuit: book('introCircuit', 'Introduction to Circuit Analysis', 5, {
                pages: 220,
                subjects: ['circuit analysis', 'electronics'],
              }),
              expertCircuit: book('expertCircuit', 'Expert Circuit Analysis', 5, {
                pages: 260,
                subjects: ['circuit analysis', 'electronics'],
              }),
            },
          },
        },
      ),
    );

    expect(snapshot.difficultyModel.lie.scheduleDifficulty).toBeGreaterThan(
      snapshot.difficultyModel.workshop.scheduleDifficulty,
    );
    expect(snapshot.difficultyModel.lie.difficultyEvidence.join(' ')).toContain(
      'ignored globally',
    );
    expect(
      snapshot.difficultyModel.expertCircuit.scheduleDifficulty,
    ).toBeGreaterThan(snapshot.difficultyModel.introCircuit.scheduleDifficulty);
  });

  it('ramps normal books from lighter early sessions toward later load', () => {
    const snapshot = computeSnapshot(
      project(
        {
          hpd: 4,
          minPg: 1,
          maxPg: 120,
          bmp: 2,
          gam: 1,
          par: 1,
          boostUnused: false,
          feasibilityMode: 'strict_floor',
        },
        {
          library: {
            books: {
              ramp: book('ramp', 'Ramp Practice', 5, {
                pages: 480,
                subjects: ['practice ramp'],
              }),
            },
          },
        },
      ),
    );
    const entries = snapshot.dayPlan.byBook.ramp ?? [];

    expect(entries.length).toBeGreaterThan(2);
    expect(entries[0].readPages + entries[0].skimPages).toBeLessThan(
      entries.at(-1)!.readPages + entries.at(-1)!.skimPages,
    );
    expect(snapshot.dayPlan.byBookStats.ramp.readingRampStage).toBeDefined();
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
        hpd: 8.5,
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
