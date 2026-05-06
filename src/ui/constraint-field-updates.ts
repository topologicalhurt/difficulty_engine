import type {
  ConstraintField,
  ConstraintSet,
  PlannerStore,
} from '../core/types';

type ConstraintFrameHandle = number | ReturnType<typeof globalThis.setTimeout>;

const pendingConstraintFramesByStore = new WeakMap<
  PlannerStore,
  Map<string, ConstraintFrameHandle>
>();

function pendingFramesForStore(
  store: PlannerStore,
): Map<string, ConstraintFrameHandle> {
  const pendingFrames = pendingConstraintFramesByStore.get(store);
  if (pendingFrames) return pendingFrames;
  const nextPendingFrames = new Map<string, ConstraintFrameHandle>();
  pendingConstraintFramesByStore.set(store, nextPendingFrames);
  return nextPendingFrames;
}

function scheduleFrame(callback: () => void): ConstraintFrameHandle {
  return globalThis.requestAnimationFrame
    ? globalThis.requestAnimationFrame(callback)
    : globalThis.setTimeout(callback, 0);
}

function cancelFrame(frameId: ConstraintFrameHandle): void {
  if (globalThis.cancelAnimationFrame && typeof frameId === 'number') {
    globalThis.cancelAnimationFrame(frameId);
    return;
  }
  globalThis.clearTimeout(frameId);
}

export function selectConstraintField(
  store: PlannerStore,
  field: ConstraintField,
): void {
  store.commands.selectConstraintField(field.key);
}

export function isCompleteDateInput(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function deferConstraintUpdate<K extends keyof ConstraintSet>(
  store: PlannerStore,
  key: K,
  value: ConstraintSet[K],
): void {
  const pendingConstraintFrames = pendingFramesForStore(store);
  const frameKey = String(key);
  const pending = pendingConstraintFrames.get(frameKey);
  if (pending != null) cancelFrame(pending);
  pendingConstraintFrames.set(
    frameKey,
    scheduleFrame(() => {
      pendingConstraintFrames.delete(frameKey);
      store.commands.updateConstraint(key, value);
    }),
  );
}

export function deferConstraintsUpdate(
  store: PlannerStore,
  patch: Partial<ConstraintSet>,
  frameKey: string,
): void {
  const pendingConstraintFrames = pendingFramesForStore(store);
  const pending = pendingConstraintFrames.get(frameKey);
  if (pending != null) cancelFrame(pending);
  pendingConstraintFrames.set(
    frameKey,
    scheduleFrame(() => {
      pendingConstraintFrames.delete(frameKey);
      store.commands.updateConstraints(patch);
    }),
  );
}
