export interface DifficultyModelEntry {
  seed: number;
  corpusComplexity: number;
  latentWorkload: number;
  workloadUncertainty: number;
  evidenceConfidence: number;
  subjectWorkloadPrior: number;
  subjectWorkloadLift: number;
  subjectClusterId: string | null;
  subjectClusterConfidence: number;
  metadataConfidence: number;
  physicalPages: number;
  effectiveReadingPages: number;
  skippedReadingPages: number;
  readingScopeConfidence: number;
  readingScopeReason: string | null;
  graphBurden: number;
  graphWorkloadLift: number;
  learnerCalibrationLift: number;
  actualsScope: string;
  bookActualConfidence: number;
  groupActualConfidence: number;
  groupActualBookCount: number;
  groupObservedMinutesPerPage: number | null;
  groupResidualDirection: string;
  profileAdjustedDifficulty: number;
  difficultyBindingReason: string | null;
  difficultyEvidence: string[];
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
