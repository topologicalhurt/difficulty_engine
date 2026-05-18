import { describe, expect, it } from 'vitest';

import { buildLearnerActualsEvidence } from '../../src/core/learner-actuals';
import {
  DEFAULT_CONSTRAINTS,
  EXAMPLE_BOOK,
  createDefaultAiRecommendationSettings,
  createDefaultSourceSettings,
  createDefaultUiPreferences,
} from '../../src/core/defaults';
import type {
  CalendarEntry,
  PlannerProjectV1,
} from '../../src/core/types';
import { computeSnapshot } from './engine-test-utils';

function entry(bookId: string, actualOverride = false): CalendarEntry {
  return {
    bookId,
    short: bookId,
    displayGroup: 'Core',
    lane: 0,
    track: 'lane:0',
    mins: 10,
    readPages: 10,
    skimPages: 0,
    boosted: false,
    floorRelaxed: false,
    effectiveMinPg: 1,
    strictMinPg: 1,
    backfilled: false,
    prereqOverlap: false,
    actualOverride,
    done: false,
  };
}

function project(
  mode: PlannerProjectV1['constraints']['actualsPropagationMode'],
  actuals: PlannerProjectV1['manualOverrides']['actuals'],
): PlannerProjectV1 {
  return {
    version: 1,
    library: {
      books: Object.fromEntries(
        ['intro', 'systems', 'advanced'].map((id) => [
          id,
          { ...EXAMPLE_BOOK, id, short: id, title: id },
        ]),
      ),
    },
    manualOverrides: { schedule: {}, deferred: {}, actuals },
    constraints: {
      ...DEFAULT_CONSTRAINTS,
      actualsPropagationMode: mode,
      learnerAdaptivityStrength: 100,
      bmp: 1,
      gam: 1,
      par: 3,
    },
    aiRecommendationSettings: createDefaultAiRecommendationSettings(),
    enrichmentCache: {},
    sourceSettings: createDefaultSourceSettings(),
    uiPreferences: createDefaultUiPreferences(),
  };
}

function evidence(
  mode: PlannerProjectV1['constraints']['actualsPropagationMode'],
  actuals: PlannerProjectV1['manualOverrides']['actuals'],
) {
  return buildLearnerActualsEvidence({
    project: project(mode, actuals),
    byDate: {
      '2026-01-05': [entry('intro'), entry('systems'), entry('advanced')],
    },
    expectedDifficultyByBook: { intro: 5, systems: 5, advanced: 5 },
    activeBookIds: ['intro', 'systems', 'advanced'],
  });
}

describe('learner actuals partial pooling', () => {
  it('partially pools repeated same-epoch actuals into unlogged epoch books', () => {
    const result = evidence('epoch_partial_pooling', {
      '2026-01-05': {
        intro: { minutes: 5, pages: 40, done: true },
        systems: { minutes: 8, pages: 40, done: true },
      },
    }).byBookId.advanced;

    expect(result.book.confidence).toBe(0);
    expect(result.group.confidence).toBeGreaterThan(0);
    expect(result.group.bookCount).toBe(2);
    expect(result.group.residualDirection).toBe('faster');
    expect(result.group.residualLift).toBeLessThan(0);
  });

  it('does not pool a single outlier into the epoch', () => {
    const result = evidence('epoch_partial_pooling', {
      '2026-01-05': {
        intro: { minutes: 5, pages: 40, done: true },
      },
    }).byBookId.advanced;

    expect(result.group.confidence).toBe(0);
    expect(result.group.bookCount).toBe(1);
    expect(result.group.residualLift).toBe(0);
  });

  it('does not let manual-only actual rows define an epoch', () => {
    const result = buildLearnerActualsEvidence({
      project: project('epoch_partial_pooling', {
        '2026-01-05': {
          intro: { minutes: 5, pages: 40, done: true },
          systems: { minutes: 8, pages: 40, done: true },
        },
      }),
      byDate: {
        '2026-01-05': [
          entry('intro', true),
          entry('systems', true),
          entry('advanced', true),
        ],
      },
      expectedDifficultyByBook: { intro: 5, systems: 5, advanced: 5 },
      activeBookIds: ['intro', 'systems', 'advanced'],
    }).byBookId.advanced;

    expect(result.group.confidence).toBe(0);
    expect(result.group.bookCount).toBe(0);
    expect(result.group.residualLift).toBe(0);
  });

  it('quarantines mixed faster/slower epoch evidence', () => {
    const result = evidence('epoch_partial_pooling', {
      '2026-01-05': {
        intro: { minutes: 5, pages: 40, done: true },
        systems: { minutes: 2000, pages: 40, done: true },
      },
    }).byBookId.advanced;

    expect(result.group.confidence).toBe(0);
    expect(result.group.residualDirection).toBe('mixed');
    expect(result.group.residualLift).toBe(0);
  });

  it('keeps logged actuals book-local by default in the full engine', () => {
    const snapshot = computeSnapshot(
      project('book_only', {
        '2026-01-05': {
          intro: { minutes: 2000, pages: 40, done: true },
        },
      }),
    );

    expect(snapshot.difficultyModel.intro.learnerCalibrationLift).not.toBe(0);
    expect(snapshot.difficultyModel.systems.learnerCalibrationLift).toBe(0);
    expect(snapshot.difficultyModel.advanced.learnerCalibrationLift).toBe(0);
    expect(snapshot.difficultyModel.advanced.actualsScope).toBe('book_only');
  });

  it('uses project partial pooling as a weaker prior for unlogged active books', () => {
    const result = buildLearnerActualsEvidence({
      project: project('project_partial_pooling', {
        '2026-01-05': {
          intro: { minutes: 5, pages: 40, done: true },
          systems: { minutes: 8, pages: 40, done: true },
          advanced: { minutes: 12, pages: 40, done: true },
        },
      }),
      byDate: {
        '2026-01-05': [
          entry('intro'),
          entry('systems'),
          entry('advanced'),
          entry('peer'),
        ],
      },
      expectedDifficultyByBook: {
        intro: 5,
        systems: 5,
        advanced: 5,
        peer: 5,
      },
      activeBookIds: ['intro', 'systems', 'advanced', 'peer'],
    }).byBookId.peer;

    expect(result.book.confidence).toBe(0);
    expect(result.group.bookCount).toBe(3);
    expect(result.group.confidence).toBeGreaterThan(0);
    expect(result.group.residualDirection).toBe('faster');
    expect(result.group.residualLift).toBeLessThan(0);
  });
});
