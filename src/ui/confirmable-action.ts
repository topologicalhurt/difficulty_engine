import type { PlannerStore } from '../core/types';

const DEFAULT_CONFIRMATION_WINDOW_MS = 6000;

const pendingConfirmationsByStore = new WeakMap<PlannerStore, Map<string, number>>();

export interface ConfirmableAction {
  id: string;
  message: string;
  action(): void;
  nowMs?: () => number;
  windowMs?: number;
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
    options.action();
    return;
  }
  pendingConfirmations(store).set(
    options.id,
    now + (options.windowMs ?? DEFAULT_CONFIRMATION_WINDOW_MS),
  );
  store.commands.setBanner({ tone: 'warn', message: options.message });
}
