// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { CONSTRAINT_FIELDS } from '../../src/core/constraint-fields';
import { deferConstraintUpdate } from '../../src/ui/constraint-field-updates';
import { renderConstraintField } from '../../src/ui/constraint-field';
import { makeStore } from '../app/store-test-utils';

describe('constraint field deferred updates', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reverts instead of committing 0 when a number field is cleared', () => {
    vi.useFakeTimers();
    const store = makeStore();
    const hpdField = CONSTRAINT_FIELDS.find((field) => field.key === 'hpd');
    if (!hpdField) throw new Error('expected an hpd constraint field');
    const before = store.selectors.getProject().constraints.hpd;

    const element = renderConstraintField(
      hpdField,
      store.selectors.getProject().constraints,
      store,
    );
    const input = element.querySelector('input');
    if (!input) throw new Error('expected a number input');

    // User clears the field and blurs (fires a change event with empty value).
    input.value = '';
    input.dispatchEvent(new Event('change'));
    vi.runAllTimers();

    // The constraint is untouched (not committed as 0 / clamped to the min),
    // and the input value is restored to the current setting.
    expect(store.selectors.getProject().constraints.hpd).toBe(before);
    expect(input.value).toBe(String(before));
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
