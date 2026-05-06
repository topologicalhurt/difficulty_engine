import { unique, sum } from './utils';
import { DEFAULT_WORKLOAD_SCORE } from './workload-cluster-config';

export function median(values: number[]): number {
  const sorted = values.slice().sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  if (!sorted.length) return DEFAULT_WORKLOAD_SCORE;
  return sorted.length % 2
    ? (sorted[mid] ?? DEFAULT_WORKLOAD_SCORE)
    : ((sorted[mid - 1] ?? DEFAULT_WORKLOAD_SCORE) +
        (sorted[mid] ?? DEFAULT_WORKLOAD_SCORE)) /
        2;
}

export function weightedJaccard(
  left: Record<string, number>,
  right: Record<string, number>,
): number {
  const keys = unique([...Object.keys(left), ...Object.keys(right)]);
  if (!keys.length) return 0;
  const shared = sum(
    keys.map((key) => Math.min(left[key] || 0, right[key] || 0)),
  );
  const total = sum(
    keys.map((key) => Math.max(left[key] || 0, right[key] || 0)),
  );
  return total ? shared / total : 0;
}
