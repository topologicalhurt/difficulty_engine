import type { SchedulePlanItem } from './types';

export interface ExclusionState {
  ignoredSet: Set<string>;
  rdSet: Set<string>;
  rdChains: Array<{ ids: string[]; avgDelta: number; avgConfidence: number; label: string }>;
  manualRDIds: string[];
}

export interface MutableSchedulePlanItem extends SchedulePlanItem {
  baseDays: number;
}

export interface OverlapCluster {
  id: string;
  topicIds: string[];
  bookIds: string[];
  primaryBookId: string;
  pruning: Array<{
    bookId: string;
    topicIds: string[];
    action: 'skim';
    reason: string;
    timeSaved: number;
    overlapFrac: number;
    prereqPenalty: number;
    confidence: number;
  }>;
}
