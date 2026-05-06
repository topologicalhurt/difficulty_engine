import { mountPlannerApp } from './app/mount';
import { plannerClock } from './core/time';
import { createEnrichmentClient } from './infra/enrichment-client';
import { createLocalIntegrationSettings } from './infra/local-integration-settings';
import { consoleLogger } from './infra/logger';
import { createLocalStoragePersistence } from './infra/persistence';
import { createQBittorrentIntegrationService } from './infra/qbittorrent-provider';
import { loadRuntimeAiConnectionPatch } from './infra/runtime-env';
import { createDefaultAiConnectionSettings } from './core/defaults';
import { normalizeAiConnectionSettings } from './core/project-normalize-ai';
import type { LocalIntegrationSettingsAdapter } from './core/types';

const STORAGE_KEY = 'difficulty-engine.planner-project.v1';
const INTEGRATION_STORAGE_KEY = 'difficulty-engine.local-integrations.v1';

function withRuntimeAiConnection(
  localSettings: LocalIntegrationSettingsAdapter,
): LocalIntegrationSettingsAdapter {
  const runtimeAiConnectionPatch = loadRuntimeAiConnectionPatch();
  if (!runtimeAiConnectionPatch) return localSettings;
  return {
    ...localSettings,
    loadAiConnection() {
      const baseConnection =
        localSettings.loadAiConnection() ?? createDefaultAiConnectionSettings();
      return {
        ...normalizeAiConnectionSettings({
          ...baseConnection,
          ...runtimeAiConnectionPatch,
          enabled:
            runtimeAiConnectionPatch.enabled ??
            (baseConnection.enabled ||
              Boolean(runtimeAiConnectionPatch.apiKey)),
        }),
      };
    },
  };
}

async function boot(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) {
    throw new Error('Missing #app root');
  }

  const localSettings = createLocalIntegrationSettings(INTEGRATION_STORAGE_KEY);

  await mountPlannerApp({
    container: root,
    persistence: createLocalStoragePersistence(STORAGE_KEY),
    localSettings: withRuntimeAiConnection(localSettings),
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
