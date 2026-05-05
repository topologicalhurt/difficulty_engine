import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CONSTRAINTS,
  EXAMPLE_BOOK,
  createDefaultAiRecommendationSettings,
  createDefaultSourceSettings,
} from '../../src/core/defaults';
import type {
  BookRecord,
  ConstraintSet,
  EngineSnapshot,
  PlannerProjectV1,
} from '../../src/core/types';
import { computeSnapshot } from './engine-test-utils';

function book(
  id: string,
  title: string,
  seed: number,
  pages: number,
  subjects: string[],
  chapters: string[],
): BookRecord {
  return {
    ...EXAMPLE_BOOK,
    id,
    title,
    short: title,
    manualSeedDifficulty: seed,
    lockDiff: false,
    pages,
    subjects,
    enrichment: {
      chapters,
      description: subjects.length
        ? `${title} covers ${subjects.join(' ')} with sustained technical development.`
        : '',
      olSubjects: subjects,
      tocSource: chapters.length ? 'manual' : 'none',
      provenance: subjects.length
        ? {
            subjects: {
              provider: 'fixture',
              fetchedAt: '2026-01-05T00:00:00.000Z',
              confidence: 0.9,
            },
            description: {
              provider: 'fixture',
              fetchedAt: '2026-01-05T00:00:00.000Z',
              confidence: 0.8,
            },
          }
        : undefined,
    },
  };
}

function project(patch: Partial<ConstraintSet> = {}): PlannerProjectV1 {
  return {
    version: 1,
    library: {
      books: {
        foundations: book(
          'foundations',
          'Linear Operators and Vector Spaces',
          7,
          420,
          ['operators', 'vector spaces', 'linear systems', 'spectral methods'],
          ['Vector spaces', 'Linear maps', 'Spectral methods'],
        ),
        advanced: book(
          'advanced',
          'Advanced Matrix and Operator Methods',
          7,
          390,
          ['matrix methods', 'operators', 'linear systems', 'spectral methods'],
          ['Matrix decompositions', 'Operator methods', 'Spectral systems'],
        ),
        sparse: book('sparse', 'Linear Algebra Done Right', 5, 357, [], []),
        light: book('light', 'Weekend Notes', 5, 90, [], []),
      },
    },
    manualOverrides: { schedule: {}, deferred: {}, actuals: {} },
    constraints: {
      ...DEFAULT_CONSTRAINTS,
      sd: '2026-01-05',
      hpd: 8,
      minPg: 4,
      maxPg: 30,
      applyOverlapSkim: false,
      mutualEnabled: false,
      ...patch,
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

function snapshot(patch: Partial<ConstraintSet> = {}): EngineSnapshot {
  return computeSnapshot(project(patch));
}

describe('adaptive workload clusters', () => {
  it('lifts a sparse specialized book instead of treating it as confidently easy', () => {
    const result = snapshot({ subjectWorkloadStrength: 100 });
    const sparse = result.difficultyModel.sparse;
    const light = result.difficultyModel.light;

    expect(sparse.subjectWorkloadLift).toBeGreaterThan(0);
    expect(sparse.scheduleDifficulty).toBeGreaterThan(light.scheduleDifficulty);
    expect(sparse.displayDifficulty).toBeGreaterThan(light.displayDifficulty);
    expect(sparse.metadataConfidence).toBeLessThan(0.42);
    expect(
      result.workloadClusters.some((cluster) =>
        cluster.assignments.some(
          (assignment) =>
            assignment.bookId === 'sparse' && assignment.sparseSpecialized,
        ),
      ),
    ).toBe(true);
  });

  it('does not arbitrarily lift unrelated sparse short notes', () => {
    const result = snapshot({ subjectWorkloadStrength: 100 });
    const light = result.difficultyModel.light;

    expect(light.subjectWorkloadLift).toBeLessThanOrEqual(0.2);
    expect(light.subjectWorkloadPrior).toBeLessThan(
      result.difficultyModel.sparse.subjectWorkloadPrior,
    );
  });

  it('scales the workload lift with the single strength control', () => {
    const disabled = snapshot({ subjectWorkloadStrength: 0 }).difficultyModel
      .sparse;
    const enabled = snapshot({ subjectWorkloadStrength: 100 }).difficultyModel
      .sparse;

    expect(disabled.subjectWorkloadLift).toBe(0);
    expect(enabled.subjectWorkloadLift).toBeGreaterThan(
      disabled.subjectWorkloadLift,
    );
    expect(enabled.scheduleDifficulty).toBeGreaterThan(
      disabled.scheduleDifficulty,
    );
  });

  it('is deterministic for identical project input', () => {
    const first = snapshot();
    const second = snapshot();

    expect(first.workloadClusters).toEqual(second.workloadClusters);
    expect(first.difficultyModel).toEqual(second.difficultyModel);
  });

  it('keeps workload clustering free of domain lexicon rules', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/core/workload-clusters.ts'),
      'utf8',
    );

    expect(source).not.toMatch(
      /mathematics|linear algebra|algebra|analysis|physics|programming/i,
    );
  });
});
