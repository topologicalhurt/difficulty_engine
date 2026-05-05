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
  maxOutputTokens: number;
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
  subjects: string[];
  displayGroup: string;
  scheduleDifficulty: number | null;
  displayDifficulty: number | null;
  owned: boolean;
}

export interface AiRecommendationRelationContext {
  from: string;
  to: string;
  type: 'prerequisite' | 'co-study';
  confidence: number;
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
  };
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
