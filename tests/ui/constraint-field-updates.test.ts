import { afterEach, describe, expect, it, vi } from 'vitest';

import { deferConstraintUpdate } from '../../src/ui/constraint-field-updates';
import { makeStore } from '../app/store-test-utils';

describe('constraint field deferred updates', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces duplicate frames within one store only', () => {
    vi.useFakeTimers();
    const leftStore = makeStore();
    const rightStore = makeStore();

    deferConstraintUpdate(leftStore, 'hpd', 2);
    deferConstraintUpdate(leftStore, 'hpd', 3);
    deferConstraintUpdate(rightStore, 'hpd', 4);
    vi.runAllTimers();

    expect(leftStore.selectors.getProject().constraints.hpd).toBe(3);
    expect(rightStore.selectors.getProject().constraints.hpd).toBe(4);
  });
});
