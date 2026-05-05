import type { AppState, PlannerProjectV1, UiState } from '../core/types';
import type { WiringContractId } from './wiring/contracts';

export interface StoreCommandContext {
  getState(): AppState;
  commitUi(contractId: WiringContractId, uiPatch: Partial<UiState>): void;
  commitProject(
    contractId: WiringContractId,
    nextProject: PlannerProjectV1,
    uiPatch?: Partial<UiState>,
    recompute?: boolean,
  ): void;
  runCatalogSearch(query?: string, append?: boolean): Promise<void>;
  refreshBookEnrichment(bookId: string): Promise<void>;
}
