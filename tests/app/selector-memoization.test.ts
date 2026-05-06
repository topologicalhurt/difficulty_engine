import { describe, expect, it } from 'vitest';

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
});
