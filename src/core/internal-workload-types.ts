export interface WorkloadBookAssignment {
  bookId: string;
  clusterId: string | null;
  subjectWorkloadPrior: number;
  metadataConfidence: number;
  clusterConfidence: number;
  similarityToCluster: number;
  nearestBookIds: string[];
  evidenceSources: string[];
  sparseSpecialized: boolean;
  shrinkageApplied: boolean;
  explanation: string;
}

export interface WorkloadCluster {
  id: string;
  label: string;
  bookIds: string[];
  topPhrases: string[];
  workloadPrior: number;
  confidence: number;
  evidenceSources: string[];
  assignments: WorkloadBookAssignment[];
}

export interface WorkloadClusterSnapshot {
  clusters: WorkloadCluster[];
  byBookId: Record<string, WorkloadBookAssignment>;
  libraryMedianWorkload: number;
}
