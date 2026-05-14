import { describe, expect, it } from 'vitest';

import { buildTopicIndex, extractCorpus } from '../../src/core/corpus';
import {
  DEFAULT_CONSTRAINTS,
  createDefaultAiRecommendationSettings,
  createDefaultSourceSettings,
  createDefaultUiPreferences,
} from '../../src/core/defaults';
import type { PairSignal } from '../../src/core/internal-types';
import { pairSignal } from '../../src/core/relation-signals';
import type { BookRecord, PlannerProjectV1 } from '../../src/core/types';

function book(
  id: string,
  title: string,
  seed: number,
  pages: number,
  chapters: string[],
  description: string,
  authors = ['Fixture Author'],
): BookRecord {
  return {
    id,
    title,
    short: title,
    authors,
    displayGroup: 'Core',
    manualSeedDifficulty: seed,
    pages,
    subjects: chapters,
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
      chapters,
      description,
      olSubjects: chapters,
      tocSource: 'manual',
    },
  };
}

function project(left: BookRecord, right: BookRecord): PlannerProjectV1 {
  return {
    version: 1,
    library: { books: { [left.id]: left, [right.id]: right } },
    manualOverrides: { schedule: {}, deferred: {}, actuals: {} },
    constraints: {
      ...DEFAULT_CONSTRAINTS,
      applyOverlapSkim: false,
      mutualEnabled: true,
    },
    aiRecommendationSettings: createDefaultAiRecommendationSettings(),
    enrichmentCache: {},
    sourceSettings: createDefaultSourceSettings(),
    uiPreferences: createDefaultUiPreferences(),
  };
}

function signal(left: BookRecord, right: BookRecord): PairSignal {
  const corpus = extractCorpus(project(left, right));
  const topicIndex = buildTopicIndex(corpus);
  return pairSignal(
    corpus.byId[left.id],
    corpus.byId[right.id],
    topicIndex,
    corpus,
  );
}

describe('pairSignal', () => {
  it('produces directional prerequisite evidence when a later book expands covered material', () => {
    const intro = book(
      'intro',
      'Foundations Volume 1',
      3,
      180,
      ['foundations', 'vectors', 'systems'],
      'A first course in foundations, vectors, and systems.',
    );
    const advanced = book(
      'advanced',
      'Foundations Volume 2',
      7,
      420,
      ['foundations', 'vectors', 'systems', 'spectral methods', 'optimization'],
      'Advanced treatment expanding foundations into spectral methods and optimization.',
    );

    const result = signal(intro, advanced);

    expect(result.coverageAB).toBeGreaterThan(0);
    expect(result.prereqAB).toBeGreaterThan(result.prereqBA);
    expect(result.reasonsAB.length).toBeGreaterThan(0);
    expect(result.progressionAB ?? 0).toBeGreaterThanOrEqual(
      result.progressionBA ?? 0,
    );
  });

  it('uses same-author evidence as a bounded co-study lift without changing topic symmetry', () => {
    const left = book(
      'left',
      'Shared Systems A',
      5,
      200,
      ['shared systems', 'models', 'practice'],
      'Shared systems models and practice.',
      ['Shared Author'],
    );
    const rightSameAuthor = book(
      'right',
      'Shared Systems B',
      5,
      210,
      ['shared systems', 'models', 'practice'],
      'Shared systems models and practice.',
      ['Shared Author'],
    );
    const rightDifferentAuthor = {
      ...rightSameAuthor,
      authors: ['Different Author'],
    };

    const same = signal(left, rightSameAuthor);
    const different = signal(left, rightDifferentAuthor);

    expect(same.sameAuthor).toBe(true);
    expect(different.sameAuthor).toBe(false);
    expect(same.symmetry).toBe(different.symmetry);
    expect(same.coStudyScore).toBeGreaterThan(different.coStudyScore);
  });

  it('feeds section topics into relation evidence without replacing chapters', () => {
    const intro = {
      ...book(
        'intro',
        'Signal Foundations',
        3,
        180,
        ['Signals'],
        'A first course in signals.',
      ),
      enrichment: {
        chapters: ['Signals'],
        topics: ['1.1 Fourier transforms', '1.2 Sampling theorem'],
        description: 'A first course in signals.',
        olSubjects: [],
        tocSource: 'manual' as const,
      },
    };
    const advanced = {
      ...book(
        'advanced',
        'Digital Signal Processing',
        7,
        420,
        ['Digital systems'],
        'Advanced signal processing.',
      ),
      enrichment: {
        chapters: ['Digital systems'],
        topics: [
          '1.1 Fourier transforms',
          '1.2 Sampling theorem',
          '2.1 Filter banks',
        ],
        description: 'Advanced signal processing.',
        olSubjects: [],
        tocSource: 'manual' as const,
      },
    };

    const result = signal(intro, advanced);

    expect(result.coverageAB).toBeGreaterThan(0);
    expect(result.sharedWeight).toBeGreaterThan(0);
  });
});
