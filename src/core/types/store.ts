import type { AppState, AppView, PlannerStoreEvent, UiState } from './app';
import type {
  AiConnectionSettings,
  AiRecommendationSettings,
  AiRelationshipWizardState,
  AutopilotWizardState,
  BookRecord,
  BookSearchSuggestion,
  ConstraintSet,
  PlannerProjectV1,
  QbittorrentConnectionSettings,
  ReadingScopeSettings,
  SourceSettings,
} from './domain';
import type { EngineSnapshot } from './snapshot';
import type {
  AiRecommendationProvider,
  Clock,
  EnrichmentProvider,
  LocalIntegrationSettingsAdapter,
  Logger,
  PlannerComputeAdapter,
  PlannerEngine,
  QbittorrentIntegrationService,
} from './services';

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
  setDialog(dialog: UiState['dialog']): void;
  setGanttView(ganttView: UiState['ganttView']): void;
  setGanttZoom(ganttZoom: number): void;
  setPlanColorMode(planColorMode: UiState['planColorMode']): void;
  setPlanSectionOpen(section: keyof UiState['planSections'], open: boolean): void;
  setLibraryListWidth(widthPx: number): void;
  setProjectBackupsEnabled(enabled: boolean): void;
  dismissWarningCode(code: string): void;
  restoreDismissedWarnings(): void;
  toggleConstraintAdvancedGroup(group: string): void;
  selectConstraintField(key: keyof ConstraintSet): void;
  setGraphOptionsOpen(open: boolean): void;
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
  updateBookReadingScope(
    id: string,
    patch: Partial<BookRecord['readingScope']>,
  ): void;
  updateReadingScopeSettings(patch: Partial<ReadingScopeSettings>): void;
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
  revealBookDocument(bookId: string, documentId: string): Promise<void>;
  removeBookDocument(
    bookId: string,
    documentId: string,
    options?: { deleteContent?: boolean },
  ): Promise<void>;
  refreshBookDocumentCandidates(bookId: string): Promise<void>;
  selectBookDocumentCandidate(
    bookId: string,
    candidateId: string,
  ): Promise<void>;
  setBookDocumentManualSource(source: string): void;
  addBookTorrentSource(bookId: string, sourceUrl: string): Promise<void>;
  readBookDocument(bookId: string, documentId: string): Promise<void>;
  closeBookDocumentReader(): void;
  clearBookMetadata(
    bookId: string,
    options?: { deleteContent?: boolean },
  ): Promise<void>;
  clearProjectMetadata(options?: { deleteContent?: boolean }): Promise<void>;
  updateAiLocalSettings(patch: Partial<AiConnectionSettings>): void;
  updateAiRecommendationSettings(
    patch: Partial<AiRecommendationSettings>,
  ): void;
  setAiRecommendationPrompt(prompt: string): void;
  setAiClarificationAnswer(messageIndex: number, answer: string): void;
  requestAiClarification(): Promise<void>;
  requestAiWorkspaceProposal(): Promise<void>;
  clearAiClarification(): void;
  requestAiRecommendations(): Promise<void>;
  clearAiRecommendation(): void;
  applyAiRecommendation(): void;
  updateAiRelationshipWizard(patch: Partial<AiRelationshipWizardState>): void;
  requestAiRelationshipReorganization(): Promise<void>;
  clearAiRelationshipProposal(): void;
  applyAiRelationshipProposal(): void;
  updateAutopilotDraft(patch: Partial<AutopilotWizardState>): void;
  solveProjectForMe(): Promise<void>;
  applyAutopilotProposal(): void;
  clearAutopilotProposal(): void;
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
  debugUi?: boolean;
  enrichmentProvider: EnrichmentProvider;
  aiRecommendationProvider?: AiRecommendationProvider;
  localSettings?: LocalIntegrationSettingsAdapter;
  qbittorrentService?: QbittorrentIntegrationService;
  logger: Logger;
  clock: Clock;
}
