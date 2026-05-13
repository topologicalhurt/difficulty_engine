import { mountPlannerApp } from './app/mount';
import { plannerClock } from './core/time';
import { createEnrichmentClient } from './infra/enrichment-client';
import { createLocalIntegrationSettings } from './infra/local-integration-settings';
import { consoleLogger } from './infra/logger';
import { createLocalStoragePersistence } from './infra/persistence';
import { createQBittorrentIntegrationService } from './infra/qbittorrent-provider';
import {
  loadRuntimeAiConnectionPatch,
  loadRuntimeDebugUi,
} from './infra/runtime-env';
import { createDefaultAiConnectionSettings } from './core/defaults';
import { DEFAULT_QBITTORRENT_BRIDGE_URL } from './core/default-source-settings';
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
    persistence: createLocalStoragePersistence(STORAGE_KEY, {
      backupEndpoint: `${DEFAULT_QBITTORRENT_BRIDGE_URL}/project-backups/write`,
    }),
    localSettings: withRuntimeAiConnection(localSettings),
    enrichmentProvider: createEnrichmentClient({
      logger: consoleLogger,
    }),
    qbittorrentService: createQBittorrentIntegrationService(),
    logger: consoleLogger,
    clock: plannerClock,
    debugUi: loadRuntimeDebugUi(),
  });
}

window.addEventListener('DOMContentLoaded', () => {
  void boot();
});
