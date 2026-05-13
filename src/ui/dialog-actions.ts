import type { PlannerStore } from '../core/types';

type DialogHandler = () => void | Promise<void>;

const handlersByStore = new WeakMap<
  PlannerStore,
  Map<string, Map<string, DialogHandler>>
>();

function handlersFor(store: PlannerStore): Map<string, Map<string, DialogHandler>> {
  const existing = handlersByStore.get(store);
  if (existing) return existing;
  const next = new Map<string, Map<string, DialogHandler>>();
  handlersByStore.set(store, next);
  return next;
}

export function registerDialogAction(
  store: PlannerStore,
  dialogId: string,
  actionId: string,
  handler: DialogHandler,
): void {
  const root = handlersFor(store);
  const actions = root.get(dialogId) ?? new Map<string, DialogHandler>();
  actions.set(actionId, handler);
  root.set(dialogId, actions);
}

export function runRegisteredDialogAction(
  store: PlannerStore,
  dialogId: string,
  actionId: string,
): void {
  const actions = handlersFor(store).get(dialogId);
  const handler = actions?.get(actionId);
  if (actionId === 'close' || actionId === 'cancel') {
    handlersFor(store).delete(dialogId);
    store.commands.setDialog(null);
    return;
  }
  if (!handler) {
    store.commands.setDialog(null);
    return;
  }
  handlersFor(store).delete(dialogId);
  store.commands.setDialog(null);
  void handler();
}
