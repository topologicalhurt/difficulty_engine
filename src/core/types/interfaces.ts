import type { AppState, AppView, PlannerStoreEvent, UiState } from './app';
import type {
  AiConnectionSettings,
  AiRecommendationProviderResponse,
  AiRecommendationRequest,
  BookSearchSuggestion,
  BookEnrichment,
  BookRecord,
  ConstraintSet,
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

export interface AiRecommendationProvider {
  recommend(
    request: AiRecommendationRequest,
  ): Promise<AiRecommendationProviderResponse>;
}

export interface LocalIntegrationSettingsAdapter {
  loadQbittorrentConnection(): QbittorrentConnectionSettings | undefined;
  saveQbittorrentConnection(settings: QbittorrentConnectionSettings): void;
  loadAiConnection(): AiConnectionSettings | undefined;
  saveAiConnection(settings: AiConnectionSettings): void;
}

export interface QbittorrentIntegrationService {
  testConnection(settings: QbittorrentConnectionSettings): Promise<void>;
  listPlugins(
    settings: QbittorrentConnectionSettings,
  ): Promise<QbittorrentPluginInfo[]>;
}

export interface PlannerEngine {
  computeSnapshot(project: PlannerProjectV1): EngineSnapshot;
}

export interface PlannerComputeAdapter {
  readonly mode: 'sync' | 'worker';
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

export interface PlannerStoreSelectors {
  getState(): AppState;
  getProject(): PlannerProjectV1;
  getSnapshot(): EngineSnapshot;
  getBook(id: string): BookRecord | undefined;
}

export interface PlannerStoreCommands {
  setActiveView(activeView: AppView): void;
  selectBook(bookId: string | null): void;
  selectCalendarEntry(dateKey: string, bookId: string): void;
  setBanner(banner: UiState['banner']): void;
  setGanttView(ganttView: UiState['ganttView']): void;
  setGanttZoom(ganttZoom: number): void;
  setPlanColorMode(planColorMode: UiState['planColorMode']): void;
  toggleConstraintAdvancedGroup(group: string): void;
  selectConstraintField(key: keyof ConstraintSet): void;
  updateConstraint<K extends keyof ConstraintSet>(
    key: K,
    value: ConstraintSet[K],
  ): void;
  updateConstraints(patch: Partial<ConstraintSet>): void;
  addBook(): void;
  addBookFromSuggestion(suggestion: BookSearchSuggestion): void;
  updateBook(id: string, patch: Partial<BookRecord>): void;
  updateBookRelations(
    id: string,
    patch: {
      manualPrereqs?: string[];
      manualDependents?: string[];
      manualCoStudy?: string[];
    },
  ): void;
  moveBook(id: string, direction: 'up' | 'down'): void;
  removeBook(id: string): void;
  deferCalendarEntry(dateKey: string, bookId: string): void;
  markCalendarEntryDone(dateKey: string, bookId: string, done?: boolean): void;
  setCalendarEntryMinutes(
    dateKey: string,
    bookId: string,
    minutes: number,
  ): void;
  setCalendarEntryPages(dateKey: string, bookId: string, pages: number): void;
  clearCalendarEntryActual(dateKey: string, bookId: string): void;
  setBookSearchQuery(query: string): void;
  clearBookSearch(): void;
  searchCatalog(query?: string): Promise<void>;
  searchCatalogMore(): Promise<void>;
  setImportExportText(value: string): void;
  importProjectText(text: string): void;
  loadProject(raw: unknown): void;
  resetProject(): void;
  updateSourceSettings(patch: Partial<SourceSettings>): void;
  updateQbittorrentLocalSettings(
    patch: Partial<QbittorrentConnectionSettings>,
  ): void;
  prepareQbittorrentQuickStart(): void;
  testQbittorrentConnection(): Promise<void>;
  refreshQbittorrentPlugins(): Promise<void>;
  setQbittorrentPluginEnabled(pluginName: string, enabled: boolean): void;
  openBookDocument(bookId: string, documentId: string): Promise<void>;
  readBookDocument(bookId: string, documentId: string): Promise<void>;
  closeBookDocumentReader(): void;
  updateAiLocalSettings(patch: Partial<AiConnectionSettings>): void;
  setAiRecommendationPrompt(prompt: string): void;
  requestAiRecommendations(): Promise<void>;
  clearAiRecommendation(): void;
  applyAiRecommendation(): void;
  refreshBookEnrichment(bookId: string): Promise<void>;
  refreshAllEnrichment(): Promise<void>;
}

export interface PlannerStoreSubscriptions {
  subscribe(listener: (state: AppState) => void): () => void;
  subscribeEvents(listener: (event: PlannerStoreEvent) => void): () => void;
}

export interface PlannerStore {
  selectors: PlannerStoreSelectors;
  commands: PlannerStoreCommands;
  subscriptions: PlannerStoreSubscriptions;
  exportProject(): string;
}

export interface CreatePlannerStoreOptions {
  initialProject?: PlannerProjectV1;
  engine: PlannerEngine;
  computeAdapter?: PlannerComputeAdapter;
  enrichmentProvider: EnrichmentProvider;
  aiRecommendationProvider?: AiRecommendationProvider;
  localSettings?: LocalIntegrationSettingsAdapter;
  qbittorrentService?: QbittorrentIntegrationService;
  logger: Logger;
  clock: Clock;
}

export interface MountPlannerAppOptions {
  container: HTMLElement;
  initialProject?: PlannerProjectV1;
  persistence?: PersistenceAdapter;
  enrichmentProvider: EnrichmentProvider;
  aiRecommendationProvider?: AiRecommendationProvider;
  localSettings?: LocalIntegrationSettingsAdapter;
  qbittorrentService?: QbittorrentIntegrationService;
  logger: Logger;
  clock: Clock;
  computeMode?: 'auto' | 'sync' | 'worker';
  performance?: {
    workerThresholdBooks?: number;
    collectMetrics?: boolean;
  };
  onPerformanceSample?: (sample: PlannerPerformanceSample) => void;
}

export interface PlannerAppHandle {
  store: PlannerStore;
  unmount(): Promise<void>;
}
