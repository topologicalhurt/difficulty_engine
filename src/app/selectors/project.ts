import type {
  AppState,
  DocumentSourceKey,
  MetadataSourceKey,
} from '../../core/types';
import { DEFAULT_QBITTORRENT_WEB_UI_URL } from '../../core/defaults';

type SourceProviderDefinition = {
  label: string;
  detail: string;
} & (
  | {
      kind: 'metadata';
      key: MetadataSourceKey;
    }
  | {
      kind: 'document';
      key: DocumentSourceKey;
    }
);

const SOURCE_PROVIDER_DEFINITIONS = [
  {
    kind: 'metadata',
    key: 'openlibrary',
    label: 'Open Library',
    detail:
      'Search, bibliographic metadata, subjects, editions, and structured TOCs.',
  },
  {
    kind: 'metadata',
    key: 'googleBooks',
    label: 'Google Books',
    detail: 'Metadata, descriptions, categories, and occasional chapter hints.',
  },
  {
    kind: 'metadata',
    key: 'internetArchive',
    label: 'Internet Archive metadata',
    detail: 'Metadata and public text candidates from Internet Archive.',
  },
  {
    kind: 'document',
    key: 'directUrl',
    label: 'Direct URL documents',
    detail:
      'Fetch legal user-provided text, EPUB, or PDF URLs attached to a book.',
  },
  {
    kind: 'document',
    key: 'localFile',
    label: 'Local files',
    detail:
      'Allow host-provided local file paths when the embedding environment supports them.',
  },
  {
    kind: 'document',
    key: 'internetArchiveText',
    label: 'Internet Archive text',
    detail: 'Prefer available public text files before falling back to PDFs.',
  },
  {
    kind: 'document',
    key: 'qbittorrent',
    label: 'qBittorrent acquisition',
    detail:
      'Preferred TOC/document source when the local bridge is enabled; lawful/user-owned torrents only.',
  },
] as const satisfies readonly SourceProviderDefinition[];

type SourceProviderRow = (typeof SOURCE_PROVIDER_DEFINITIONS)[number] & {
  checked: boolean;
};

function sourceProviderChecked(
  definition: (typeof SOURCE_PROVIDER_DEFINITIONS)[number],
  state: AppState,
): boolean {
  return definition.kind === 'metadata'
    ? state.project.sourceSettings.metadataSources[definition.key]
    : state.project.sourceSettings.documentSources[definition.key];
}

export type ProjectSourceProviderRow = SourceProviderRow;

export interface ProjectViewModel {
  importExportText: string;
  importExportDirty: boolean;
  sourceSettings: AppState['project']['sourceSettings'];
  sourceProviders: ProjectSourceProviderRow[];
  contentPreferenceLabel: string;
  qbittorrentConnection: AppState['ui']['qbittorrentConnection'];
  qbittorrentStatus: AppState['ui']['qbittorrentStatus'];
  exportedCredentialFree: boolean;
  qbittorrentLaunchCommand: string;
  qbittorrentConfigureCommand: string;
}

function shellQuote(value: string): string {
  return value.includes(' ') ? `"${value.replace(/"/g, '\\"')}"` : value;
}

export function selectProjectViewModel(state: AppState): ProjectViewModel {
  const localPassword = state.ui.qbittorrentConnection.password;
  const sourceProviders = SOURCE_PROVIDER_DEFINITIONS.map((definition) => ({
    ...definition,
    checked: sourceProviderChecked(definition, state),
  }));
  return {
    importExportText: state.ui.importExportText,
    importExportDirty: state.ui.importExportDirty,
    sourceSettings: state.project.sourceSettings,
    sourceProviders,
    contentPreferenceLabel:
      state.project.sourceSettings.contentPreference.join(' -> '),
    qbittorrentConnection: state.ui.qbittorrentConnection,
    qbittorrentStatus: state.ui.qbittorrentStatus,
    exportedCredentialFree:
      !localPassword || !state.ui.importExportText.includes(localPassword),
    qbittorrentLaunchCommand: `npm run qbittorrent:launch -- --url ${DEFAULT_QBITTORRENT_WEB_UI_URL} --bridge-url ${state.ui.qbittorrentConnection.baseUrl} --data-root ${shellQuote(state.ui.qbittorrentConnection.savePath)} --allowed-origin http://127.0.0.1:*,http://localhost:*`,
    qbittorrentConfigureCommand: `npm run qbittorrent:launch -- --enable-webui --url ${DEFAULT_QBITTORRENT_WEB_UI_URL} --bridge-url ${state.ui.qbittorrentConnection.baseUrl} --data-root ${shellQuote(state.ui.qbittorrentConnection.savePath)} --allowed-origin http://127.0.0.1:*,http://localhost:*`,
  };
}
