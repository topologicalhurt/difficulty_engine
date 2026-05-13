import type {
  AutopilotGoal,
  AutopilotWizardState,
  PlannerOptimizationInput,
  PlannerOptimizationResult,
} from './optimization';

export type AiRecommendationProviderKey = 'openai' | 'anthropic';
export type AiReasoningMode =
  | 'provider_default'
  | 'none'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh';
export type AiRecommendationWorkMode = 'new_books' | 'plan' | 'both';

export interface AiRecommendationSettings {
  maxSuggestions: number;
  dagDepth: number;
  workMode: AiRecommendationWorkMode;
  includeExistingContext: boolean;
}

export interface AiConnectionSettings {
  enabled: boolean;
  provider: AiRecommendationProviderKey;
  model: string;
  endpointUrl: string;
  apiKey: string;
  timeoutMs: number;
  maxOutputTokens: number | null;
  reasoningMode: AiReasoningMode;
}

export interface AiRecommendationStatus {
  state: 'idle' | 'loading' | 'ready' | 'failed';
  message: string;
}

export interface AiRecommendedBook {
  proposalId: string;
  title: string;
  authors: string[];
  isbn: string | null;
  pages: number | null;
  subjects: string[];
  displayGroup: string;
  manualSeedDifficulty: number;
  rationale: string;
  prerequisiteIds: string[];
  coStudyIds: string[];
}

export interface AiProjectSettingSuggestion {
  key: string;
  currentValue: string;
  suggestedValue: string;
  confidence: number;
  rationale: string;
}

export interface AiRecommendationProposal {
  id: string;
  provider: AiRecommendationProviderKey;
  model: string;
  prompt: string;
  summary: string;
  books: AiRecommendedBook[];
  removeBookIds: string[];
  bookOrder: string[];
  projectSettings: AiProjectSettingSuggestion[];
  warnings: string[];
  createdAt: string;
  contextDigest: string;
}

export type AiRelationshipGoal =
  | 'confidence_first'
  | 'deadline_first'
  | 'deep_mastery'
  | 'survey_first'
  | 'custom';
export type AiRelationshipProgressionStyle =
  | 'layered'
  | 'linear'
  | 'parallel_tracks'
  | 'project_first';
export type AiRelationshipStrictness =
  | 'preserve_existing'
  | 'rebalance_soft'
  | 'rebuild_from_scratch';

export interface AiRelationshipWizardState {
  goal: AiRelationshipGoal;
  progressionStyle: AiRelationshipProgressionStyle;
  strictness: AiRelationshipStrictness;
  preserveManualRelations: boolean;
  notes: string;
}

export interface AiRelationshipStageProposal {
  label: string;
  bookIds: string[];
  rationale: string;
}

export interface AiRelationshipEdgeProposal {
  from: string;
  to: string;
  type: 'prerequisite' | 'co-study';
  confidence: number;
  rationale: string;
}

export interface AiRelationshipProposal {
  id: string;
  provider: AiRecommendationProviderKey;
  model: string;
  summary: string;
  stages: AiRelationshipStageProposal[];
  relations: AiRelationshipEdgeProposal[];
  warnings: string[];
  createdAt: string;
  contextDigest: string;
  wizard: AiRelationshipWizardState;
}

export interface AiClarificationMessage {
  role: 'assistant' | 'user';
  text: string;
}

export interface AiClarificationProviderResponse {
  question?: unknown;
  questions?: unknown;
  ready?: unknown;
  refinedPrompt?: unknown;
  warnings?: unknown;
}

export interface AiRecommendationBookContext {
  id: string;
  title: string;
  authors: string[];
  isbn: string | null;
  pages: number;
  physicalPages: number;
  effectiveReadingPages: number | null;
  skippedReadingPages: number | null;
  subjects: string[];
  displayGroup: string;
  scheduleDifficulty: number | null;
  displayDifficulty: number | null;
  latentWorkload?: number | null;
  workloadUncertainty?: number | null;
  evidenceConfidence?: number | null;
  difficultyEvidence?: string[];
  chapters: string[];
  tocSource: string;
  readingScope?: {
    mode: string;
    skippedSectionTitles: string[];
    includedSectionTitles: string[];
  };
  documentStatuses: Array<{
    provider: string;
    contentKind: string;
    status: string;
    matchScore: number;
    progress: number;
    seeders: number | null;
  }>;
  progress: {
    completed: boolean;
    actualPages: number;
    actualMinutes: number;
  };
  manualSchedule?: {
    startSlot?: number;
    days?: number;
  };
  deferredDates: string[];
  owned: boolean;
  ignored: boolean;
  completed: boolean;
}

export interface AiRecommendationRelationContext {
  from: string;
  to: string;
  type:
    | 'prerequisite'
    | 'co-study'
    | 'reference'
    | 'manual-block'
    | 'manual-allow-overlap';
  confidence: number;
  score?: number;
  reasons?: string[];
  sources?: string[];
}

export interface AiRecommendationContext {
  books: AiRecommendationBookContext[];
  relations: AiRecommendationRelationContext[];
  constraints: {
    parallel: number;
    hoursPerDay: number;
    minPages: number;
    maxPages: number;
    scheduleAlgorithm: string;
    prerequisiteMode: string;
    bookOrderPolicy: string;
    learnerProfileMode?: string;
    learnerAdaptivityStrength?: number;
    targetChallenge?: number;
    relativePacingStrength?: number;
    feasibilityMode?: string;
    dailyBookMode?: string;
    requestedDagDepth?: number;
    aiWorkMode?: AiRecommendationWorkMode;
  };
  readingScopeSettings?: {
    defaultMode: string;
    skipKinds: string[];
  };
  planSummary?: {
    totalHours: number;
    remainingHours: number;
    spanWeeks: number;
    peakBooks: number;
    hardInfeasibleBooks: number;
    blockedBooks: number;
  };
  diagnostics: {
    warns: string[];
    fails: string[];
  };
}

export interface AutopilotProposal {
  id: string;
  createdAt: string;
  mode: AutopilotGoal;
  summary: string;
  constraintPatch: Record<string, unknown>;
  bookPatches: Record<string, Record<string, unknown>>;
  reasons: string[];
  unchangedReasons: string[];
  wizard: AutopilotWizardState;
  optimizationInput: PlannerOptimizationInput;
  optimization: PlannerOptimizationResult;
}

export interface AiRecommendationRequest {
  prompt: string;
  provider: AiRecommendationProviderKey;
  model: string;
  connection: AiConnectionSettings;
  maxSuggestions: number;
  settings: AiRecommendationSettings;
  clarifications: AiClarificationMessage[];
  context: AiRecommendationContext;
  signal?: AbortSignal;
}

export interface AiRelationshipRequest {
  provider: AiRecommendationProviderKey;
  model: string;
  connection: AiConnectionSettings;
  context: AiRecommendationContext;
  wizard: AiRelationshipWizardState;
  settings: AiRecommendationSettings;
  clarifications: AiClarificationMessage[];
  prompt: string;
  signal?: AbortSignal;
}

export interface AiClarificationRequest {
  prompt: string;
  provider: AiRecommendationProviderKey;
  model: string;
  connection: AiConnectionSettings;
  settings: AiRecommendationSettings;
  context: AiRecommendationContext;
  messages: AiClarificationMessage[];
  signal?: AbortSignal;
}

export interface AiRecommendationProviderResponse {
  summary?: unknown;
  books?: unknown;
  removeBookIds?: unknown;
  bookOrder?: unknown;
  projectSettings?: unknown;
  warnings?: unknown;
}

export interface AiRelationshipProviderResponse {
  summary?: unknown;
  stages?: unknown;
  relations?: unknown;
  warnings?: unknown;
}
