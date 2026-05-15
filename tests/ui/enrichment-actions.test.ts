import { describe, expect, it, vi } from 'vitest';

import { createPlannerStore } from '../../src/app/store';
import { createDefaultSourceSettings } from '../../src/core/defaults';
import { createPlannerEngine } from '../../src/core/engine';
import { plannerClock } from '../../src/core/time';
import type {
  EnrichmentProvider,
  QbittorrentIntegrationService,
} from '../../src/core/types';
import { runRegisteredDialogAction } from '../../src/ui/dialog-actions';
import { runEnrichmentWithBridgePreflight } from '../../src/ui/enrichment-actions';
import { makeProject, silentLogger } from '../app/store-test-utils';

function storeWithQbittorrentService(
  service: QbittorrentIntegrationService,
): ReturnType<typeof createPlannerStore> {
  const sourceSettings = createDefaultSourceSettings();
  sourceSettings.documentSources.qbittorrent = true;
  return createPlannerStore({
    initialProject: makeProject({ sourceSettings }),
    engine: createPlannerEngine({ clock: plannerClock, logger: silentLogger }),
    enrichmentProvider: {
      fetchBook: vi.fn(),
      searchBooks: vi.fn(),
    } as unknown as EnrichmentProvider,
    qbittorrentService: service,
    logger: silentLogger,
    clock: plannerClock,
  });
}

function qbitService(
  testConnection: QbittorrentIntegrationService['testConnection'],
): QbittorrentIntegrationService {
  return {
    testConnection,
    listPlugins: vi.fn(),
    findDocumentCandidates: vi.fn(),
    acquireDocumentCandidate: vi.fn(),
    deleteTorrent: vi.fn(),
  };
}

describe('enrichment bridge preflight', () => {
  it('asks before enriching when the qBittorrent bridge is unavailable', async () => {
    const action = vi.fn();
    const service = qbitService(vi.fn(async () => {
      throw new Error('NetworkError when attempting to fetch resource.');
    }));
    const store = storeWithQbittorrentService(service);
    store.commands.updateQbittorrentLocalSettings({ enabled: true });

    await runEnrichmentWithBridgePreflight(store, true, 'test.bridge', action);

    expect(action).not.toHaveBeenCalled();
    expect(service.testConnection).toHaveBeenCalledTimes(1);
    expect(store.selectors.getState().ui.dialog).toMatchObject({
      id: 'test.bridge',
      title: 'Bridge unavailable',
      actions: expect.arrayContaining([
        expect.objectContaining({
          id: 'confirm',
          label: 'Continue metadata-only',
        }),
      ]),
    });

    runRegisteredDialogAction(store, 'test.bridge', 'confirm');

    expect(action).toHaveBeenCalledWith({ skipBridgeDocuments: true });
  });

  it('runs immediately when the qBittorrent bridge is reachable', async () => {
    const action = vi.fn();
    const service = qbitService(vi.fn(async () => undefined));
    const store = storeWithQbittorrentService(service);
    store.commands.updateQbittorrentLocalSettings({ enabled: true });

    await runEnrichmentWithBridgePreflight(store, true, 'test.bridge', action);

    expect(action).toHaveBeenCalledWith({});
    expect(store.selectors.getState().ui.dialog).toBeNull();
  });

  it('runs immediately when the current selectors do not require bridge preflight', async () => {
    const action = vi.fn();
    const service = qbitService(vi.fn(async () => {
      throw new Error('NetworkError when attempting to fetch resource.');
    }));
    const store = storeWithQbittorrentService(service);

    await runEnrichmentWithBridgePreflight(store, false, 'test.bridge', action);

    expect(action).toHaveBeenCalledWith({});
    expect(service.testConnection).not.toHaveBeenCalled();
    expect(store.selectors.getState().ui.dialog).toBeNull();
  });
});
