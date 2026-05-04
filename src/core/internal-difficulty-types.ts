export interface DifficultyModelEntry {
  seed: number;
  corpusComplexity: number;
  subjectWorkloadPrior: number;
  subjectWorkloadLift: number;
  subjectClusterId: string | null;
  subjectClusterConfidence: number;
  metadataConfidence: number;
  graphBurden: number;
  noveltyLoad: number;
  breadthLoad: number;
  retentionLoad: number;
  scheduleDifficulty: number;
  displayDifficulty: number;
  topologicalDepth: number;
  explanation: string[];
}

export interface DifficultyModelSnapshot {
  byId: Record<string, DifficultyModelEntry>;
  depths: Record<string, number>;
}
