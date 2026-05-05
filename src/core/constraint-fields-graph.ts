import type { ConstraintField } from './types';

export const GRAPH_CONTROL_FIELDS: ConstraintField[] = [
  {
    key: 'tr',
    group: 'Graph Controls',
    label: 'Trim redundant edges',
    description: 'Remove redundant edges when building the graph.',
    effect: 'relation_model',
    kind: 'boolean',
  },
  {
    key: 'part',
    group: 'Graph Controls',
    label: 'Partition display groups',
    description: 'Allow display groups to partition diagnostics.',
    effect: 'relation_model',
    kind: 'boolean',
  },
];
