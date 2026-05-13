import { describe, expect, it } from 'vitest';

import { selectGraphRenderModel } from '../../src/app/selectors/graph-render-data';
import { selectLibraryViewModel } from '../../src/app/selectors/library';
import { selectPlanViewModel } from '../../src/app/selectors/plan';
import { selectorMetricSnapshot } from '../../src/app/selectors/memo';
import { makeStore } from './store-test-utils';

describe('selector memoization', () => {
  it('keeps expensive plan view models stable for unrelated UI changes', () => {
    const store = makeStore();
    const initial = selectPlanViewModel(store.selectors.getState());

    store.commands.setBanner({ tone: 'info', message: 'local UI only' });

    const afterBanner = selectPlanViewModel(store.selectors.getState());
    expect(afterBanner).toBe(initial);
    expect(selectorMetricSnapshot()['plan.viewModel']?.hits).toBeGreaterThan(0);
  });

  it('invalidates plan view models when selected plan inputs change', () => {
    const store = makeStore();
    const initial = selectPlanViewModel(store.selectors.getState());

    store.commands.setGanttZoom(1.2);

    const afterZoom = selectPlanViewModel(store.selectors.getState());
    expect(afterZoom).not.toBe(initial);
  });

  it('keeps graph render models stable for unrelated UI changes', () => {
    const store = makeStore();
    const initial = selectGraphRenderModel(store.selectors.getState());

    store.commands.setBanner({ tone: 'info', message: 'local UI only' });

    const afterBanner = selectGraphRenderModel(store.selectors.getState());
    expect(afterBanner).toBe(initial);
    expect(selectorMetricSnapshot()['graph.renderModel']?.hits).toBeGreaterThan(
      0,
    );
  });

  it('invalidates graph render models when graph inputs change', () => {
    const store = makeStore();
    const initial = selectGraphRenderModel(store.selectors.getState());

    store.commands.updateConstraint(
      'tr',
      !store.selectors.getState().project.constraints.tr,
    );

    const afterGraphChange = selectGraphRenderModel(store.selectors.getState());
    expect(afterGraphChange).not.toBe(initial);
  });

  it('keeps library view models stable for unrelated UI changes', () => {
    const store = makeStore();
    const initial = selectLibraryViewModel(store.selectors.getState());

    store.commands.setBanner({ tone: 'info', message: 'local UI only' });

    const afterBanner = selectLibraryViewModel(store.selectors.getState());
    expect(afterBanner).toBe(initial);
    expect(selectorMetricSnapshot()['library.viewModel']?.hits).toBeGreaterThan(
      0,
    );
  });

  it('invalidates library view models when library UI inputs change', () => {
    const store = makeStore();
    const initial = selectLibraryViewModel(store.selectors.getState());

    store.commands.setLibraryListWidth(360);

    const afterResize = selectLibraryViewModel(store.selectors.getState());
    expect(afterResize).not.toBe(initial);
  });
});
