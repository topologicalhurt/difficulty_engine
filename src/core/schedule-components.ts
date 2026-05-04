import { DisjointSet } from './disjoint-set';

export function coStudyComponents(
  ids: string[],
  coStudyPairs: Array<[string, string]>,
): string[][] {
  const components = new DisjointSet(ids);
  coStudyPairs.forEach(([left, right]) => {
    components.union(left, right);
  });
  return components
    .groups(ids)
    .sort((left, right) => left[0].localeCompare(right[0]));
}
