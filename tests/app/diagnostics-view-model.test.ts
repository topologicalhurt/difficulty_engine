import { describe, expect, it } from 'vitest';

import { selectDiagnosticsViewModel } from '../../src/app/selectors/diagnostics';
import type { AppState } from '../../src/core/types';

describe('diagnostics view model', () => {
  it('uses deterministic tie-breaks for equal relation and difficulty scores', () => {
    const state = {
      project: {
        library: {
          books: {
            b: { short: 'Beta' },
            a: { short: 'Alpha' },
          },
        },
      },
      snapshot: {
        diagnostics: { passes: [], warns: [], fails: [] },
        relations: [
          { from: 'b', to: 'a', type: 'prerequisite', score: 0.7, confidence: 0.7 },
          { from: 'a', to: 'b', type: 'prerequisite', score: 0.7, confidence: 0.7 },
        ],
        difficultyModel: {
          b: { scheduleDifficulty: 5 },
          a: { scheduleDifficulty: 5 },
        },
        workloadClusters: [],
        overlapClusters: [],
      },
    } as unknown as AppState;

    const viewModel = selectDiagnosticsViewModel(state);

    expect(viewModel.relations.map((relation) => `${relation.from}->${relation.to}`)).toEqual([
      'a->b',
      'b->a',
    ]);
    expect(viewModel.difficultyRows.map((row) => row.bookId)).toEqual(['a', 'b']);
  });
});
