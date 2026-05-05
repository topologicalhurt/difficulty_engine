import {
  normalizeQbittorrentConnectionSettings,
  normalizeSourceSettings,
} from '../core/project-normalize-sources';
import type {
  CreatePlannerStoreOptions,
  PlannerProjectV1,
  QbittorrentConnectionSettings,
  SourceSettings,
} from '../core/types';
import type { StoreCommandContext } from './store-command-context';

export function applySourceSettingsPatch(
  project: PlannerProjectV1,
  patch: Partial<SourceSettings>,
): PlannerProjectV1 {
  return {
    ...project,
    sourceSettings: normalizeSourceSettings({
      ...project.sourceSettings,
      ...patch,
      metadataSources: {
        ...project.sourceSettings.metadataSources,
        ...(patch.metadataSources ?? {}),
      },
      documentSources: {
        ...project.sourceSettings.documentSources,
        ...(patch.documentSources ?? {}),
      },
      qbittorrent: {
        ...project.sourceSettings.qbittorrent,
        ...(patch.qbittorrent ?? {}),
      },
    }),
  };
}

export function commitQbittorrentConnectionPatch(
  context: StoreCommandContext,
  services: CreatePlannerStoreOptions,
  patch: Partial<QbittorrentConnectionSettings>,
): void {
  const state = context.getState();
  const nextSettings = normalizeQbittorrentConnectionSettings({
    ...state.ui.qbittorrentConnection,
    ...patch,
  });
  services.localSettings?.saveQbittorrentConnection(nextSettings);
  context.commitUi('project.qbittorrentLocal', {
    qbittorrentConnection: nextSettings,
    qbittorrentStatus: {
      ...state.ui.qbittorrentStatus,
      state: 'idle',
      message: nextSettings.enabled
        ? 'qBittorrent settings saved locally.'
        : 'qBittorrent is disabled.',
    },
  });
}
