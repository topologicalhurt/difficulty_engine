import type { RelationEvidence } from './types';

export interface PairSignal {
  leftId: string;
  rightId: string;
  sharedWeight: number;
  phraseCoverageAB?: number;
  phraseCoverageBA?: number;
  tokenCoverageAB?: number;
  tokenCoverageBA?: number;
  focusCoverageAB?: number;
  focusCoverageBA?: number;
  coverageAB: number;
  coverageBA: number;
  overlap: number;
  coStudyScore: number;
  prereqAB: number;
  prereqBA: number;
  progressionAB?: number;
  progressionBA?: number;
  reasonsAB: string[];
  reasonsBA: string[];
  reference: number;
  symmetry: number;
  matchedTopics?: Array<{
    a: string;
    b: string | null;
    sim: number;
    weight: number;
  }>;
  sameAuthor?: boolean;
}

export interface RelationInfo {
  relations: RelationEvidence[];
  prereqById: Record<string, string[]>;
  coStudyPairs: Array<[string, string]>;
  byPair: Record<string, PairSignal>;
  confidence: number;
  manualAllowOverlap: Record<string, boolean>;
}
