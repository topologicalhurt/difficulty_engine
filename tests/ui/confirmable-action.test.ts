import { describe, expect, it, vi } from 'vitest';

import { runConfirmableAction } from '../../src/ui/confirmable-action';
import { makeStore } from '../app/store-test-utils';

describe('confirmable UI actions', () => {
  it('requires a second click before running a destructive action', () => {
    const store = makeStore();
    const action = vi.fn();
    let now = 1000;

    runConfirmableAction(store, {
      id: 'danger',
      message: 'Confirm this action.',
      action,
      nowMs: () => now,
    });

    expect(action).not.toHaveBeenCalled();
    expect(store.selectors.getState().ui.banner?.message).toBe(
      'Confirm this action.',
    );

    now += 500;
    runConfirmableAction(store, {
      id: 'danger',
      message: 'Confirm this action.',
      action,
      nowMs: () => now,
    });

    expect(action).toHaveBeenCalledTimes(1);
  });

  it('expires pending confirmations after the configured window', () => {
    const store = makeStore();
    const action = vi.fn();
    let now = 1000;

    runConfirmableAction(store, {
      id: 'danger',
      message: 'Confirm this action.',
      action,
      nowMs: () => now,
      windowMs: 100,
    });

    now += 101;
    runConfirmableAction(store, {
      id: 'danger',
      message: 'Confirm this action.',
      action,
      nowMs: () => now,
      windowMs: 100,
    });

    expect(action).not.toHaveBeenCalled();
  });
});
