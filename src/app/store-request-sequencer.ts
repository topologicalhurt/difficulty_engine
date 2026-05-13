export interface StoreRequestSequencer {
  begin(): number;
  invalidate(): number;
  isCurrent(sequence: number): boolean;
  current(): number;
}

export function createStoreRequestSequencer(): StoreRequestSequencer {
  let sequence = 0;
  return {
    begin(): number {
      sequence += 1;
      return sequence;
    },
    invalidate(): number {
      sequence += 1;
      return sequence;
    },
    isCurrent(requestSequence: number): boolean {
      return requestSequence === sequence;
    },
    current(): number {
      return sequence;
    },
  };
}
