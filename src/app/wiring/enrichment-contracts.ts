import type { WiringContract } from './contract-types';

export const ENRICHMENT_CONTRACTS: WiringContract[] = [
  {
    id: 'enrichment.cacheStatus',
    surface: 'library',
    control: 'Enrichment status',
    command: 'ephemeral',
    projectReads: ['enrichmentCache'],
    projectWrites: ['enrichmentCache'],
    uiReads: [],
    uiWrites: ['banner'],
    snapshotEffects: [],
    renderEffects: ['library', 'diagnostics'],
    recomputePolicy: 'persistence_only',
    testIds: ['tests/app/store-enrichment.test.ts'],
    notes:
      'Loading/stale/failed cache status is persisted but does not alter planner truth, so it must not recompute snapshots.',
  },
  {
    id: 'enrichment.refreshBook',
    surface: 'library',
    control: 'Refresh enrichment',
    command: 'refreshBookEnrichment',
    projectReads: ['library.books', 'enrichmentCache'],
    projectWrites: ['library.books', 'enrichmentCache'],
    uiReads: [],
    uiWrites: ['banner'],
    snapshotEffects: [
      'topics',
      'relations',
      'difficultyModel',
      'schedulePlan',
      'dayPlan',
    ],
    renderEffects: ['library', 'plan', 'graphs', 'diagnostics'],
    recomputePolicy: 'async_then_snapshot',
    testIds: ['tests/app/store.test.ts', 'tests/app/wiring-contracts.test.ts'],
    notes:
      'Single-book enrichment writes status without recompute, then applies enriched book data through the normal snapshot pipeline.',
  },
  {
    id: 'enrichment.refreshAll',
    surface: 'library',
    control: 'Refresh all enrichment',
    command: 'refreshAllEnrichment',
    projectReads: ['library.books', 'enrichmentCache'],
    projectWrites: ['library.books', 'enrichmentCache'],
    uiReads: [],
    uiWrites: ['banner'],
    snapshotEffects: [
      'topics',
      'relations',
      'difficultyModel',
      'schedulePlan',
      'dayPlan',
    ],
    renderEffects: ['library', 'plan', 'graphs', 'diagnostics'],
    recomputePolicy: 'async_then_snapshot',
    testIds: ['tests/app/wiring-contracts.test.ts'],
    notes:
      'Bulk enrichment runs provider requests in parallel, stages cache/book updates, and recomputes once at batch completion.',
  },
];
