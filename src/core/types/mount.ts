import type { PlannerProjectV1 } from './domain';
import type { PlannerStore } from './store';
import type {
  AiRecommendationProvider,
  Clock,
  EnrichmentProvider,
  LocalIntegrationSettingsAdapter,
  Logger,
  PersistenceAdapter,
  PlannerPerformanceSample,
  QbittorrentIntegrationService,
} from './services';

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
  debugUi?: boolean;
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
