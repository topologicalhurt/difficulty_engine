import { describe, expect, it, vi } from 'vitest';

import { runConfirmableAction } from '../../src/ui/confirmable-action';
import { runRegisteredDialogAction } from '../../src/ui/dialog-actions';
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
    expect(store.selectors.getState().ui.dialog).toMatchObject({
      id: 'danger',
      body: 'Confirm this action.',
    });

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

  it('disarms the re-click window after the dialog is cancelled', () => {
    const store = makeStore();
    const action = vi.fn();
    let now = 1000;

    runConfirmableAction(store, {
      id: 'danger',
      message: 'Confirm this action.',
      action,
      nowMs: () => now,
    });
    expect(store.selectors.getState().ui.dialog).toMatchObject({ id: 'danger' });

    // User clicks Cancel in the dialog.
    runRegisteredDialogAction(store, 'danger', 'cancel');
    expect(action).not.toHaveBeenCalled();
    expect(store.selectors.getState().ui.dialog).toBeNull();

    // A second trigger click well within the window must NOT fire directly;
    // it must re-arm and re-show the dialog instead.
    now += 500;
    runConfirmableAction(store, {
      id: 'danger',
      message: 'Confirm this action.',
      action,
      nowMs: () => now,
    });
    expect(action).not.toHaveBeenCalled();
    expect(store.selectors.getState().ui.dialog).toMatchObject({ id: 'danger' });
  });

  it('runs the action and disarms when the dialog Confirm button is used', () => {
    const store = makeStore();
    const action = vi.fn();
    const now = 1000;

    runConfirmableAction(store, {
      id: 'danger',
      message: 'Confirm this action.',
      action,
      nowMs: () => now,
    });

    runRegisteredDialogAction(store, 'danger', 'confirm');
    expect(action).toHaveBeenCalledTimes(1);
    expect(store.selectors.getState().ui.dialog).toBeNull();
  });
});
