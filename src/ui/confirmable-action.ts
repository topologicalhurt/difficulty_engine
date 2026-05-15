import type { PlannerStore } from '../core/types';
import { registerDialogAction } from './dialog-actions';

const DEFAULT_CONFIRMATION_WINDOW_MS = 6000;

const pendingConfirmationsByStore = new WeakMap<PlannerStore, Map<string, number>>();

export interface ConfirmableAction {
  id: string;
  title?: string;
  message: string;
  action(): void;
  nowMs?: () => number;
  windowMs?: number;
  confirmLabel?: string;
  confirmTone?: 'primary' | 'danger';
  cancelLabel?: string;
}

function pendingConfirmations(store: PlannerStore): Map<string, number> {
  const existing = pendingConfirmationsByStore.get(store);
  if (existing) return existing;
  const next = new Map<string, number>();
  pendingConfirmationsByStore.set(store, next);
  return next;
}

export function runConfirmableAction(
  store: PlannerStore,
  options: ConfirmableAction,
): void {
  const now = options.nowMs?.() ?? Date.now();
  const deadline = pendingConfirmations(store).get(options.id) ?? 0;
  if (deadline >= now) {
    pendingConfirmations(store).delete(options.id);
    store.commands.setDialog(null);
    options.action();
    return;
  }
  pendingConfirmations(store).set(
    options.id,
    now + (options.windowMs ?? DEFAULT_CONFIRMATION_WINDOW_MS),
  );
  registerDialogAction(store, options.id, 'confirm', options.action);
  store.commands.setDialog({
    id: options.id,
    title: options.title ?? 'Confirm action',
    body: options.message,
    tone: 'warn',
    actions: [
      {
        id: 'cancel',
        label: options.cancelLabel ?? 'Cancel',
        tone: 'secondary',
      },
      {
        id: 'confirm',
        label: options.confirmLabel ?? 'Confirm',
        tone: options.confirmTone ?? 'danger',
      },
    ],
  });
}
