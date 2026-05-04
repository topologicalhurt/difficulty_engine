export const DEFAULT_WORKLOAD_SCORE = 5;
export const WORKLOAD_TOPIC_LIMIT = 6;
export const WORKLOAD_NEAREST_NEIGHBOR_LIMIT = 3;
export const WORKLOAD_FINGERPRINT_DISTANCE = 9;

export const METADATA_CONFIDENCE = {
  base: 0.08,
  min: 0.08,
  max: 1,
  titleTokenNormalizer: 4,
  subjectNormalizer: 3,
  descriptionWordNormalizer: 90,
  chapterNormalizer: 8,
  topicNormalizer: 12,
  titleWeight: 0.1,
  subjectWeight: 0.2,
  descriptionWeight: 0.2,
  chapterWeight: 0.2,
  topicWeight: 0.18,
  provenanceWeight: 0.08,
  localSourceWeight: 0.04,
} as const;

export const INITIAL_WORKLOAD_MODEL = {
  min: 1,
  max: 10,
  pagePressureMin: -0.8,
  pagePressureMax: 1.2,
  seedWeight: 0.32,
  complexityWeight: 0.48,
  pagePressureWeight: 0.55,
  topicCountNormalizer: 18,
  topicCountWeight: 0.45,
  rarityNormalizer: 3,
  rarityWeight: 0.55,
  graphDepthWeight: 0.12,
  prerequisiteCountWeight: 0.15,
} as const;

export const CLUSTER_CONFIDENCE_MODEL = {
  min: 0.12,
  max: 0.95,
  metadataWeight: 0.55,
  sizeNormalizer: 4,
  sizeWeight: 0.25,
  connectivityWeight: 0.2,
  shrinkageConfidenceCutoff: 0.8,
  shrinkageMetadataCutoff: 0.8,
} as const;
