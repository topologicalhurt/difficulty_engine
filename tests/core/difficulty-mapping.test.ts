import { describe, expect, it } from 'vitest';

import { applyCompressionCurve } from '../../src/core/compression-curves';
import {
  DEFAULT_CONSTRAINTS,
  EXAMPLE_BOOK,
  createDefaultAiRecommendationSettings,
  createDefaultSourceSettings,
  createDefaultUiPreferences,
} from '../../src/core/defaults';
import {
  difficultyDistributionStats,
  mapDisplayDifficulty,
} from '../../src/core/difficulty-mapping';
import type {
  BookRecord,
  CompressCurve,
  ConstraintSet,
  EngineSnapshot,
  PlannerProjectV1,
} from '../../src/core/types';
import { computeSnapshot } from './engine-test-utils';

function book(
  id: string,
  title: string,
  seed: number,
  prereqs: string[] = [],
): BookRecord {
  return {
    ...EXAMPLE_BOOK,
    id,
    title,
    short: title,
    manualSeedDifficulty: seed,
    lockDiff: true,
    pages: 120 + seed * 20,
    subjects: [
      title,
      'shared topic',
      seed > 6 ? 'advanced methods' : 'foundations',
    ],
    manualPrereqs: prereqs,
    enrichment: {
      chapters: [`${title} foundations`, `${title} applications`],
      description: `${title} shared topic foundations advanced methods.`,
      olSubjects: [title, 'shared topic'],
      tocSource: 'manual',
    },
  };
}

function project(patch: Partial<ConstraintSet> = {}): PlannerProjectV1 {
  return {
    version: 1,
    library: {
      books: {
        easy: book('easy', 'Easy', 2),
        mid: book('mid', 'Middle', 5, ['easy']),
        hard: book('hard', 'Hard', 9, ['mid']),
      },
    },
    manualOverrides: { schedule: {}, deferred: {}, actuals: {} },
    constraints: {
      ...DEFAULT_CONSTRAINTS,
      sd: '2026-01-05',
      applyOverlapSkim: false,
      mutualEnabled: false,
      ...patch,
    },
    aiRecommendationSettings: createDefaultAiRecommendationSettings(),
    enrichmentCache: {},
    sourceSettings: createDefaultSourceSettings(),
    uiPreferences: createDefaultUiPreferences(),
  };
}

function snapshot(patch: Partial<ConstraintSet> = {}): EngineSnapshot {
  return computeSnapshot(project(patch));
}

function unlockedSnapshot(patch: Partial<ConstraintSet> = {}): EngineSnapshot {
  const input = project(patch);
  Object.values(input.library.books).forEach((entry) => {
    entry.lockDiff = false;
  });
  return computeSnapshot(input);
}

function displaySignature(result: EngineSnapshot): string {
  return Object.entries(result.difficultyModel)
    .map(([id, entry]) => `${id}:${entry.displayDifficulty}`)
    .sort()
    .join('|');
}

function scheduleSignature(result: EngineSnapshot): string {
  return JSON.stringify({
    stats: result.scheduleStats,
    items: result.schedulePlan.items.map((item) => ({
      id: item.id,
      scheduleDifficulty: item.scheduleDifficulty,
      baseDays: item.baseDays,
      plannedDays: item.plannedDays,
      dayPages: item.dayPages,
      dayMins: item.dayMins,
      hours: item.hours,
      releaseSlot: item.releaseSlot,
      targetWindow: item.targetWindow,
    })),
    dayPlan: result.dayPlan.byDate,
    warnings: result.renderModel.warnings,
  });
}

describe('difficulty mapping controls', () => {
  const curvePairs: Array<[CompressCurve, CompressCurve, number]> = [
    ['power', 'inverse_power', 2],
    ['smoothstep', 'inverse_smoothstep', 1],
    ['tanh', 'inverse_tanh', 1],
    ['sine', 'inverse_sine', 1],
    ['logistic', 'inverse_logistic', 1],
  ];
  const allCurves: CompressCurve[] = [
    'power',
    'inverse_power',
    'smoothstep',
    'inverse_smoothstep',
    'tanh',
    'inverse_tanh',
    'sine',
    'inverse_sine',
    'logistic',
    'inverse_logistic',
    'linear',
  ];

  it('keeps every compression curve bounded at the endpoints', () => {
    allCurves.forEach((curve) => {
      expect(applyCompressionCurve(0, curve, 1.4)).toBeCloseTo(0, 5);
      expect(applyCompressionCurve(1, curve, 1.4)).toBeCloseTo(1, 5);
    });
  });

  it('implements explicit inverse curve pairs', () => {
    curvePairs.forEach(([curve, inverse, exponent]) => {
      [0.15, 0.35, 0.65, 0.85].forEach((value) => {
        const uncurved = applyCompressionCurve(value, inverse, exponent);
        expect(applyCompressionCurve(uncurved, curve, exponent)).toBeCloseTo(
          value,
          4,
        );
      });
    });
  });

  it('uses curve floor and ceiling points to control mapped clipping', () => {
    const constraints: ConstraintSet = {
      ...DEFAULT_CONSTRAINTS,
      diffMapMode: 'scaled',
      compressMode: 'off',
      diffMapMin: 3,
      diffMapMax: 9,
      diffCurveFloorPoint: 0.3,
      diffCurveCeilingPoint: 0.6,
      gam: 1.5,
      diffRamp: 1,
    };
    const stats = difficultyDistributionStats([1, 10]);

    expect(mapDisplayDifficulty(3.7, constraints, stats)).toBeCloseTo(3, 1);
    expect(mapDisplayDifficulty(6.4, constraints, stats)).toBeCloseTo(9, 1);
    expect(
      mapDisplayDifficulty(
        6.4,
        { ...constraints, diffCurveCeilingPoint: 1 },
        stats,
      ),
    ).toBeLessThan(9);
  });

  it('maps scaled display difficulty into the configured output range', () => {
    const result = snapshot({
      diffMapMode: 'scaled',
      diffMapMin: 4,
      diffMapMax: 8,
      compressMode: 'off',
      diffRamp: 1,
      gam: 1.5,
    });
    const values = Object.values(result.difficultyModel).map(
      (entry) => entry.displayDifficulty,
    );

    expect(Math.min(...values)).toBeCloseTo(4, 1);
    expect(Math.max(...values)).toBeCloseTo(8, 1);
  });

  it('wires display mapping controls into displayDifficulty', () => {
    const base = snapshot({
      diffMapMode: 'scaled',
      diffMapMin: 3,
      diffMapMax: 8,
      compressMode: 'off',
      diffRamp: 1,
    });
    const baseDisplay = displaySignature(base);

    expect(
      displaySignature(snapshot({ diffMapMode: 'raw' })),
    ).not.toBe(baseDisplay);
    expect(
      displaySignature(snapshot({ diffMapMode: 'scaled', diffMapMin: 5, diffMapMax: 9 })),
    ).not.toBe(baseDisplay);
    expect(
      displaySignature(snapshot({ diffMapMode: 'scaled', compressMode: 'off', diffRamp: 2 })),
    ).not.toBe(baseDisplay);
    expect(
      displaySignature(
        snapshot({
          diffMapMode: 'scaled',
          compressMode: 'manual',
          compressExp: 2,
        }),
      ),
    ).not.toBe(baseDisplay);
    expect(
      displaySignature(
        snapshot({
          diffMapMode: 'scaled',
          compressMode: 'manual',
          compressCurve: 'tanh',
        }),
      ),
    ).not.toBe(baseDisplay);
    expect(
      displaySignature(
        snapshot({
          diffMapMode: 'scaled',
          compressMode: 'manual',
          compressCurve: 'inverse_tanh',
        }),
      ),
    ).not.toBe(baseDisplay);
    expect(
      displaySignature(
        snapshot({
          diffMapMode: 'scaled',
          compressMode: 'manual',
          diffCurveCeilingPoint: 0.65,
        }),
      ),
    ).not.toBe(baseDisplay);
  });

  it('keeps display compression controls out of schedule hours and day allocation', () => {
    const base = snapshot({
      diffMapMode: 'scaled',
      compressMode: 'off',
      compressCurve: 'linear',
      compressExp: 1,
      diffRamp: 1,
      diffCurveFloorPoint: 0,
      diffCurveCeilingPoint: 1,
    });
    const compressed = snapshot({
      diffMapMode: 'scaled',
      compressMode: 'manual',
      compressCurve: 'logistic',
      compressExp: 2,
      diffRamp: 2.5,
      diffCurveFloorPoint: 0.3,
      diffCurveCeilingPoint: 0.65,
    });

    expect(compressed.difficultyModel.mid.displayDifficulty).not.toBe(
      base.difficultyModel.mid.displayDifficulty,
    );
    expect(scheduleSignature(compressed)).toBe(scheduleSignature(base));
  });

  it('keeps gamma as a workload-time setting rather than display compression', () => {
    const baseDisplay = snapshot({
      diffMapMode: 'scaled',
      compressMode: 'off',
      diffRamp: 1,
      gam: 1.5,
    }).difficultyModel.mid.displayDifficulty;
    const higherGamma = snapshot({
      diffMapMode: 'scaled',
      compressMode: 'off',
      diffRamp: 1,
      gam: 3,
    });

    expect(higherGamma.difficultyModel.mid.displayDifficulty).toBe(baseDisplay);
    expect(higherGamma.scheduleStats.totalHours).not.toBe(
      snapshot({
        diffMapMode: 'scaled',
        compressMode: 'off',
        diffRamp: 1,
        gam: 1.5,
      }).scheduleStats.totalHours,
    );
  });

  it('wires graph blending controls into scheduleDifficulty', () => {
    const base = unlockedSnapshot({
      blendMode: 'linear',
      propMix: 1,
      damp: 0,
      alphaCap: 1,
      absFloor: 2,
      propLiftCap: 4,
    }).difficultyModel.hard.scheduleDifficulty;

    expect(
      unlockedSnapshot({ propMix: 0 }).difficultyModel.hard.scheduleDifficulty,
    ).not.toBe(base);
    expect(
      unlockedSnapshot({ damp: 1 }).difficultyModel.hard.scheduleDifficulty,
    ).not.toBe(base);
    expect(
      unlockedSnapshot({ alphaCap: 0.05, absFloor: 0.1, propLiftCap: 0.2 })
        .difficultyModel.hard.scheduleDifficulty,
    ).not.toBe(base);
    expect(
      unlockedSnapshot({ blendMode: 'geometric', propMix: 1, damp: 0 })
        .difficultyModel.hard.scheduleDifficulty,
    ).not.toBe(base);
  });
});
