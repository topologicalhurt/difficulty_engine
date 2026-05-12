export interface DifficultyBreakdown {
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
  physicalPages?: number;
  effectiveReadingPages?: number;
  skippedReadingPages?: number;
  readingScopeConfidence?: number;
  readingScopeReason?: string | null;
  graphBurden: number;
  graphWorkloadLift: number;
  learnerCalibrationLift: number;
  profileAdjustedDifficulty: number;
  difficultyBindingReason: string | null;
  difficultyEvidence: string[];
  novelty: number;
  breadth: number;
  retention: number;
  scheduleDifficulty: number;
  displayDifficulty: number;
  explanation: string[];
}

export interface WorkloadClusterSummary {
  id: string;
  label: string;
  bookIds: string[];
  topPhrases: string[];
  workloadPrior: number;
  confidence: number;
  evidenceSources: string[];
  assignments: Array<{
    bookId: string;
    metadataConfidence: number;
    subjectWorkloadPrior: number;
    similarityToCluster: number;
    nearestBookIds: string[];
    sparseSpecialized: boolean;
    shrinkageApplied: boolean;
    explanation: string;
  }>;
}
