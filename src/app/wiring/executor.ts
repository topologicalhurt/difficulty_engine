import {
  getWiringContract,
  type RecomputePolicy,
  type WiringContractId,
} from './contracts';

function allowsProjectMutation(
  policy: RecomputePolicy,
  recompute: boolean,
): boolean {
  if (
    policy === 'snapshot' ||
    policy === 'async_then_snapshot' ||
    policy === 'project_load'
  ) {
    return recompute;
  }
  return policy === 'persistence_only' && !recompute;
}

export function assertUiMutation(contractId: WiringContractId): void {
  getWiringContract(contractId);
}

export function assertProjectMutation(
  contractId: WiringContractId,
  recompute: boolean,
): void {
  const contract = getWiringContract(contractId);
  if (!allowsProjectMutation(contract.recomputePolicy, recompute)) {
    throw new Error(
      `Wiring contract ${contract.id} uses ${contract.recomputePolicy} but attempted a project mutation with recompute=${String(recompute)}.`,
    );
  }
}
