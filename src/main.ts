import { mountPlannerApp } from './app/mount';
import { plannerClock } from './core/time';
import { createEnrichmentClient } from './infra/enrichment-client';
import { createLocalIntegrationSettings } from './infra/local-integration-settings';
import { consoleLogger } from './infra/logger';
import { createLocalStoragePersistence } from './infra/persistence';
import { createQBittorrentIntegrationService } from './infra/qbittorrent-provider';

const STORAGE_KEY = 'difficulty-engine.planner-project.v1';
const INTEGRATION_STORAGE_KEY = 'difficulty-engine.local-integrations.v1';

async function boot(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) {
    throw new Error('Missing #app root');
  }

  await mountPlannerApp({
    container: root,
    persistence: createLocalStoragePersistence(STORAGE_KEY),
    localSettings: createLocalIntegrationSettings(INTEGRATION_STORAGE_KEY),
    enrichmentProvider: createEnrichmentClient({
      logger: consoleLogger,
    }),
    qbittorrentService: createQBittorrentIntegrationService(),
    logger: consoleLogger,
    clock: plannerClock,
  });
}

window.addEventListener('DOMContentLoaded', () => {
  void boot();
});
