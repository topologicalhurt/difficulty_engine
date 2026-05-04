import type { PlannerStoreCommands } from '../../core/types';

export type RecomputePolicy =
  | 'ui_only'
  | 'snapshot'
  | 'async_then_snapshot'
  | 'project_load'
  | 'persistence_only';

export interface WiringContract {
  id: string;
  surface: string;
  control: string;
  command: keyof PlannerStoreCommands | 'exportProject' | 'ephemeral';
  projectReads: string[];
  projectWrites: string[];
  uiReads: string[];
  uiWrites: string[];
  snapshotEffects: string[];
  renderEffects: string[];
  recomputePolicy: RecomputePolicy;
  testIds: string[];
  notes: string;
}

export type WiringContractId = WiringContract['id'];
