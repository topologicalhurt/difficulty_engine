import { AI_CONTRACTS } from './ai-contracts';
import { CALENDAR_CONTRACTS } from './calendar-contracts';
import { CONSTRAINT_CONTRACTS } from './constraint-contracts';
import { CONSTRAINT_UI_CONTRACTS } from './constraint-ui-contracts';
import { ENRICHMENT_CONTRACTS } from './enrichment-contracts';
import { LIBRARY_CONTRACTS } from './library-contracts';
import { PROJECT_CONTRACTS } from './project-contracts';
import { SEARCH_CONTRACTS } from './search-contracts';
import { SHELL_CONTRACTS } from './shell-contracts';
import type { WiringContract, WiringContractId } from './contract-types';
import { PLAN_DISPLAY_CONTRACTS } from './ui-contracts';

export type {
  RecomputePolicy,
  WiringContract,
  WiringContractId,
} from './contract-types';
export { constraintContractId } from './constraint-contracts';

export const WIRING_CONTRACTS: WiringContract[] = [
  ...CONSTRAINT_CONTRACTS,
  ...AI_CONTRACTS,
  ...SHELL_CONTRACTS,
  ...CONSTRAINT_UI_CONTRACTS,
  ...LIBRARY_CONTRACTS,
  ...CALENDAR_CONTRACTS,
  ...SEARCH_CONTRACTS,
  ...ENRICHMENT_CONTRACTS,
  ...PROJECT_CONTRACTS,
  ...PLAN_DISPLAY_CONTRACTS,
];

export function getWiringContract(id: WiringContractId): WiringContract {
  const contractMatch = WIRING_CONTRACTS.find((item) => item.id === id);
  if (!contractMatch) {
    throw new Error(`Missing wiring contract: ${id}`);
  }
  return contractMatch;
}

export function contractIdsForCommand(
  command: WiringContract['command'],
): string[] {
  return WIRING_CONTRACTS.filter((item) => item.command === command).map(
    (item) => item.id,
  );
}

export function commandNamesWithContracts(): Array<WiringContract['command']> {
  return Array.from(
    new Set(WIRING_CONTRACTS.map((item) => item.command)),
  ).sort();
}
