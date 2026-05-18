import { describe, expect, it } from 'vitest';

import {
  selectConstraintsViewModel,
  selectGraphOptionsViewModel,
} from '../../src/app/selectors/constraints';
import { makeBook, makeProject, makeStore } from './store-test-utils';

function constraintsStore() {
  return makeStore({
    initialProject: makeProject({
      books: {
        easy: makeBook({
          id: 'easy',
          title: 'Easy Book',
          short: 'Easy',
          manualSeedDifficulty: 3,
          subjects: ['easy'],
        }),
        hard: makeBook({
          id: 'hard',
          title: 'Hard Book',
          short: 'Hard',
          manualSeedDifficulty: 8,
          subjects: ['hard'],
        }),
      },
    }),
  });
}

describe('constraints view model', () => {
  it('separates primary and advanced fields by group disclosure state', () => {
    const plannerStore = constraintsStore();
    let viewModel = selectConstraintsViewModel(
      plannerStore.selectors.getState(),
    );
    const difficultyGroup = viewModel.groups.find(
      (group) => group.group === 'Difficulty Mapping',
    );
    const pacingGroup = viewModel.groups.find(
      (group) => group.group === 'Pacing Model',
    );
    const planWindowGroup = viewModel.groups.find(
      (group) => group.group === 'Plan Window',
    );

    expect(planWindowGroup?.fields.map((field) => field.key)).toEqual(
      expect.arrayContaining(['sd', 'tl']),
    );
    expect(difficultyGroup?.hiddenAdvancedCount).toBeGreaterThan(0);
    expect(difficultyGroup?.fields.map((field) => field.key)).toEqual([
      'diffMapMode',
    ]);
    expect(pacingGroup?.fields.map((field) => field.key)).toContain(
      'learnerProfileMode',
    );
    expect(pacingGroup?.fields.map((field) => field.key)).toContain(
      'actualsPropagationMode',
    );
    expect(pacingGroup?.hiddenAdvancedCount).toBeGreaterThan(0);

    plannerStore.commands.toggleConstraintAdvancedGroup('Difficulty Mapping');
    viewModel = selectConstraintsViewModel(plannerStore.selectors.getState());
    expect(
      viewModel.groups
        .find((group) => group.group === 'Difficulty Mapping')
        ?.fields.map((field) => field.key),
    ).toContain('diffRamp');
  });

  it('returns focused field and selected option explanations', () => {
    const plannerStore = constraintsStore();
    plannerStore.commands.selectConstraintField('diffMapMode');
    plannerStore.commands.updateConstraint('diffMapMode', 'scaled');

    const viewModel = selectConstraintsViewModel(
      plannerStore.selectors.getState(),
    );

    expect(viewModel.explanation.title).toBe('Display map mode');
    expect(viewModel.explanation.selectedOptionDetail).toContain(
      'current library',
    );
  });

  it('explains actuals propagation as conservative by default', () => {
    const plannerStore = constraintsStore();
    plannerStore.commands.selectConstraintField('actualsPropagationMode');

    const viewModel = selectConstraintsViewModel(
      plannerStore.selectors.getState(),
    );

    expect(viewModel.explanation.title).toBe(
      'Use actuals across study group',
    );
    expect(viewModel.explanation.selectedOptionDetail).toContain(
      'one book’s actuals never imply anything about other books',
    );
  });

  it('builds a difficulty mapping chart model from current books', () => {
    const viewModel = selectConstraintsViewModel(
      constraintsStore().selectors.getState(),
    );

    expect(viewModel.difficultyMapping.curve.length).toBeGreaterThan(10);
    expect(viewModel.difficultyMapping.identity).toHaveLength(
      viewModel.difficultyMapping.curve.length,
    );
    expect(viewModel.difficultyMapping.legendLabels).toEqual([
      'Identity',
      'Current curve',
      'Books',
    ]);
    expect(viewModel.difficultyMapping.books).toHaveLength(2);
    expect(
      viewModel.difficultyMapping.books.every((book) =>
        book.color.startsWith('hsl('),
      ),
    ).toBe(true);
    expect(
      viewModel.difficultyMapping.books.some((book) => book.plotOffset !== 0),
    ).toBe(true);
    expect(viewModel.difficultyMapping.highestBook).not.toBe('No books yet');
  });

  it('exposes paired compression curve options and clip guide data', () => {
    const plannerStore = constraintsStore();
    plannerStore.commands.toggleConstraintAdvancedGroup('Difficulty Mapping');
    plannerStore.commands.updateConstraint('diffCurveFloorPoint', 0.2);
    plannerStore.commands.updateConstraint('diffCurveCeilingPoint', 0.75);
    const viewModel = selectConstraintsViewModel(
      plannerStore.selectors.getState(),
    );
    const curveField = viewModel.groups
      .find((group) => group.group === 'Difficulty Mapping')
      ?.fields.find((field) => field.key === 'compressCurve');
    const curveValues = curveField?.options?.map((option) => option.value);

    expect(curveValues).toContain('inverse_power');
    expect(curveValues).toContain('inverse_smoothstep');
    expect(curveValues).toContain('inverse_tanh');
    expect(curveValues).toContain('sine');
    expect(curveValues).toContain('logistic');
    expect(
      viewModel.difficultyMapping.floorGuide?.rawDifficulty,
    ).toBeGreaterThan(1);
    expect(
      viewModel.difficultyMapping.ceilingGuide?.rawDifficulty,
    ).toBeLessThan(10);
  });

  it('keeps Graphs tab options limited to graph display behavior', () => {
    const viewModel = selectGraphOptionsViewModel(
      constraintsStore().selectors.getState(),
    );
    const keys = viewModel.groups.flatMap((group) =>
      group.fields.map((field) => field.key),
    );

    expect(keys.sort()).toEqual(['part', 'tr']);
  });
});
