import { readPerformanceNowMs } from '../performance';

export interface SelectorMetricSnapshot {
  hits: number;
  misses: number;
  lastMs: number;
}

const selectorMetrics = new Map<string, SelectorMetricSnapshot>();

function sameKeys(left: readonly unknown[], right: readonly unknown[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function recordSelectorMetric(id: string, hit: boolean, elapsedMs: number): void {
  const current = selectorMetrics.get(id) ?? { hits: 0, misses: 0, lastMs: 0 };
  selectorMetrics.set(id, {
    hits: current.hits + (hit ? 1 : 0),
    misses: current.misses + (hit ? 0 : 1),
    lastMs: elapsedMs,
  });
}

export function memoizeSelector<State, Result>(
  id: string,
  keyForState: (state: State) => readonly unknown[],
  compute: (state: State) => Result,
): (state: State) => Result {
  let previousKeys: readonly unknown[] | null = null;
  let previousResult: Result;
  return (state: State): Result => {
    const keys = keyForState(state);
    const startedAt = readPerformanceNowMs();
    if (previousKeys && sameKeys(previousKeys, keys)) {
      recordSelectorMetric(id, true, readPerformanceNowMs() - startedAt);
      return previousResult;
    }
    previousKeys = [...keys];
    previousResult = compute(state);
    recordSelectorMetric(id, false, readPerformanceNowMs() - startedAt);
    return previousResult;
  };
}

export function selectorMetricSnapshot(): Record<string, SelectorMetricSnapshot> {
  return Object.fromEntries(selectorMetrics.entries());
}
