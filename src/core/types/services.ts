import type {
  AiClarificationProviderResponse,
  AiClarificationRequest,
  AiConnectionSettings,
  AiRecommendationProviderResponse,
  AiRecommendationRequest,
  AiRelationshipProviderResponse,
  AiRelationshipRequest,
  BookDocumentBlockedCandidateOption,
  BookDocumentCandidateOption,
  BookDocumentRef,
  BookDocumentSearchAttempt,
  BookEnrichment,
  BookRecord,
  BookSearchSuggestion,
  EnrichmentFieldProvenance,
  PlannerProjectV1,
  QbittorrentConnectionSettings,
  QbittorrentPluginInfo,
  SourceSettings,
} from './domain';
import type { EngineSnapshot } from './snapshot';

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export interface Clock {
  now(): Date;
  timelineStart(project: PlannerProjectV1): Date;
  slotToDate(slot: number, start: Date, project: PlannerProjectV1): Date;
  dateKey(date: Date): string;
  totalTimelineSlots(project: PlannerProjectV1): number;
  realWeeks(project: PlannerProjectV1): number;
}

export interface PersistenceAdapter {
  load(): Promise<PlannerProjectV1 | undefined> | PlannerProjectV1 | undefined;
  save(project: PlannerProjectV1): Promise<void> | void;
}

export interface EnrichmentRequest {
  book: BookRecord;
  sourceSettings: SourceSettings;
  qbittorrentConnection?: QbittorrentConnectionSettings;
  skipBridgeDocuments?: boolean;
  signal?: AbortSignal;
}

export interface EnrichmentResponse {
  cacheKey: string;
  bookPatch: Partial<BookRecord>;
  enrichment: BookEnrichment;
  provenance: EnrichmentFieldProvenance[];
}

export interface SearchBooksRequest {
  query: string;
  sourceSettings: SourceSettings;
  offset?: number;
  limit?: number;
  signal?: AbortSignal;
}

export interface SearchBooksResponse {
  results: BookSearchSuggestion[];
  hasMore: boolean;
  nextOffset: number;
  mode: 'isbn' | 'search';
}

export interface EnrichmentProvider {
  fetchBook(request: EnrichmentRequest): Promise<EnrichmentResponse>;
  searchBooks(request: SearchBooksRequest): Promise<SearchBooksResponse>;
}

export type BridgeHealthStatus =
  | 'ok'
  | 'not_running'
  | 'origin_blocked'
  | 'qbit_unreachable'
  | 'data_root_mismatch'
  | 'unknown_error';

export interface QbittorrentBridgeHealth {
  status: BridgeHealthStatus;
  message: string;
  targetBaseUrl?: string;
  dataRoot?: string;
  allowedOrigins?: string[];
}

export interface AiRecommendationProvider {
  recommend(
    request: AiRecommendationRequest,
  ): Promise<AiRecommendationProviderResponse>;
  clarifyRecommendation?(
    request: AiClarificationRequest,
  ): Promise<AiClarificationProviderResponse>;
  reorganizeRelationships?(
    request: AiRelationshipRequest,
  ): Promise<AiRelationshipProviderResponse>;
}

export interface LocalIntegrationSettingsAdapter {
  loadQbittorrentConnection(): QbittorrentConnectionSettings | undefined;
  saveQbittorrentConnection(settings: QbittorrentConnectionSettings): void;
  loadAiConnection(): AiConnectionSettings | undefined;
  saveAiConnection(settings: AiConnectionSettings): void;
}

export interface QbittorrentIntegrationService {
  checkBridgeHealth?(
    settings: QbittorrentConnectionSettings,
  ): Promise<QbittorrentBridgeHealth>;
  testConnection(settings: QbittorrentConnectionSettings): Promise<void>;
  listPlugins(
    settings: QbittorrentConnectionSettings,
  ): Promise<QbittorrentPluginInfo[]>;
  findDocumentCandidates(
    settings: QbittorrentConnectionSettings,
    request: EnrichmentRequest,
  ): Promise<{
    candidates: BookDocumentCandidateOption[];
    blockedCandidates: BookDocumentBlockedCandidateOption[];
    searchAttempts: BookDocumentSearchAttempt[];
  }>;
  acquireDocumentCandidate(
    settings: QbittorrentConnectionSettings,
    request: EnrichmentRequest,
    candidateId: string,
    candidates: BookDocumentCandidateOption[],
  ): Promise<BookDocumentRef | null>;
  deleteTorrent(
    settings: QbittorrentConnectionSettings,
    hash: string,
    deleteFiles: boolean,
  ): Promise<void>;
}

export interface PlannerEngine {
  computeSnapshot(project: PlannerProjectV1): EngineSnapshot;
}

export interface PlannerComputeAdapter {
  readonly mode: 'sync' | 'worker';
  shouldDefer?(project: PlannerProjectV1): boolean;
  compute(project: PlannerProjectV1): Promise<EngineSnapshot>;
  cancelCurrent(): void;
  destroy?(): void;
}

export interface PlannerPerformanceSample {
  bookCount: number;
  relationCount: number;
  visibleDomNodes: number;
  snapshotMs: number;
  selectorMs: number;
  renderMs: number;
  workerMs: number;
  longTaskCount: number;
  timestamp: number;
}
