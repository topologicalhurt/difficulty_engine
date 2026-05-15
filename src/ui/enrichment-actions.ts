import type { EnrichmentRefreshOptions, PlannerStore } from '../core/types';
import { runConfirmableAction } from './confirmable-action';

const BRIDGE_WARNING =
  'We could not connect to the local qBittorrent bridge. qBittorrent PDF sourcing, local TOC extraction, OCR, local cleanup, and folder backups will be skipped. Continue with online metadata only?';

function bridgeWarning(explanation?: string | null): string {
  return explanation
    ? `${BRIDGE_WARNING}\n\nLast bridge status: ${explanation}`
    : BRIDGE_WARNING;
}

async function bridgeConnectionReady(store: PlannerStore): Promise<boolean> {
  return store.commands.testQbittorrentConnection();
}

export async function runEnrichmentWithBridgePreflight(
  store: PlannerStore,
  requiresBridgePreflight: boolean,
  dialogId: string,
  action: (options?: EnrichmentRefreshOptions) => void | Promise<void>,
  bridgeUnavailableExplanation?: string | null,
): Promise<void> {
  if (!requiresBridgePreflight) {
    await action({});
    return;
  }
  const bridgeReady = await bridgeConnectionReady(store).catch(() => false);
  if (bridgeReady) {
    await action({});
    return;
  }
  runConfirmableAction(store, {
    id: dialogId,
    title: 'Bridge unavailable',
    message: bridgeWarning(bridgeUnavailableExplanation),
    confirmLabel: 'Continue metadata-only',
    confirmTone: 'primary',
    action: () => {
      void action({ skipBridgeDocuments: true });
    },
    windowMs: 30_000,
  });
}

export function refreshAllEnrichmentWithBridgePreflight(
  store: PlannerStore,
  requiresBridgePreflight: boolean,
  bridgeUnavailableExplanation?: string | null,
): Promise<void> {
  return runEnrichmentWithBridgePreflight(
    store,
    requiresBridgePreflight,
    'enrichment.bridge.refreshAll',
    (options) => store.commands.refreshAllEnrichment(options),
    bridgeUnavailableExplanation,
  );
}

export function refreshBookEnrichmentWithBridgePreflight(
  store: PlannerStore,
  requiresBridgePreflight: boolean,
  bookId: string,
  bridgeUnavailableExplanation?: string | null,
): Promise<void> {
  return runEnrichmentWithBridgePreflight(
    store,
    requiresBridgePreflight,
    `enrichment.bridge.refreshBook.${bookId}`,
    (options) => store.commands.refreshBookEnrichment(bookId, options),
    bridgeUnavailableExplanation,
  );
}
