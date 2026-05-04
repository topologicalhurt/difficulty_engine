import type { WiringContract } from './contract-types';

export const ENRICHMENT_CONTRACTS: WiringContract[] = [
  {
    id: 'enrichment.refreshBook',
    surface: 'library',
    control: 'Refresh enrichment',
    command: 'refreshBookEnrichment',
    projectReads: ['library.books', 'enrichmentCache'],
    projectWrites: ['library.books', 'enrichmentCache'],
    uiReads: [],
    uiWrites: ['banner'],
    snapshotEffects: ['topics', 'relations', 'difficultyModel', 'schedulePlan', 'dayPlan'],
    renderEffects: ['library', 'plan', 'graphs', 'diagnostics'],
    recomputePolicy: 'async_then_snapshot',
    testIds: ['tests/app/store.test.ts', 'tests/app/wiring-contracts.test.ts'],
    notes: 'Enrichment writes project/cache first, then recomputes through the normal pipeline.',
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
    snapshotEffects: ['topics', 'relations', 'difficultyModel', 'schedulePlan', 'dayPlan'],
    renderEffects: ['library', 'plan', 'graphs', 'diagnostics'],
    recomputePolicy: 'async_then_snapshot',
    testIds: ['tests/app/wiring-contracts.test.ts'],
    notes: 'Bulk enrichment is serialized through the single-book enrichment command.',
  },
];
