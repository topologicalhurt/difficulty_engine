export type AiRecommendationProviderKey = 'openai' | 'anthropic';

export interface AiRecommendationSettings {
  maxSuggestions: number;
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

export interface AiRecommendationProposal {
  id: string;
  provider: AiRecommendationProviderKey;
  model: string;
  prompt: string;
  summary: string;
  books: AiRecommendedBook[];
  warnings: string[];
  createdAt: string;
  contextDigest: string;
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
  mode: 'confidence_first';
  summary: string;
  constraintPatch: Record<string, unknown>;
  readingScopeSettingsPatch: Record<string, unknown>;
  bookPatches: Record<string, Record<string, unknown>>;
  reasons: string[];
  unchangedReasons: string[];
}

export interface AiRecommendationRequest {
  prompt: string;
  provider: AiRecommendationProviderKey;
  model: string;
  connection: AiConnectionSettings;
  maxSuggestions: number;
  context: AiRecommendationContext;
  signal?: AbortSignal;
}

export interface AiRecommendationProviderResponse {
  summary?: unknown;
  books?: unknown;
  warnings?: unknown;
}
