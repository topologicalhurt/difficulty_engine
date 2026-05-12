import type {
  AppState,
  DocumentSourceKey,
  MetadataSourceKey,
  ReadingScopeSettings,
} from '../../core/types';
import {
  DEFAULT_QBITTORRENT_BRIDGE_ALLOWED_ORIGINS,
  DEFAULT_QBITTORRENT_WEB_UI_URL,
} from '../../core/defaults';
import { readingScopeSettingsForProject } from '../../core/reading-scope';

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
  {
    kind: 'document',
    key: 'localOcr',
    label: 'Local OCR fallback',
    detail:
      'Optional bridge-only OCR for trusted completed PDFs when embedded text and raw TOC extraction fail.',
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
  readingScopeSettings: ReadingScopeSettings;
  sourceProviders: ProjectSourceProviderRow[];
  contentPreferenceLabel: string;
  qbittorrentConnection: AppState['ui']['qbittorrentConnection'];
  qbittorrentStatus: AppState['ui']['qbittorrentStatus'];
  exportedCredentialFree: boolean;
  qbittorrentLaunchCommand: string;
  qbittorrentConfigureCommand: string;
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function selectProjectViewModel(state: AppState): ProjectViewModel {
  const localPassword = state.ui.qbittorrentConnection.password;
  const allowedOrigins = DEFAULT_QBITTORRENT_BRIDGE_ALLOWED_ORIGINS;
  const sourceProviders = SOURCE_PROVIDER_DEFINITIONS.map((definition) => ({
    ...definition,
    checked: sourceProviderChecked(definition, state),
  }));
  return {
    importExportText: state.ui.importExportText,
    importExportDirty: state.ui.importExportDirty,
    sourceSettings: state.project.sourceSettings,
    readingScopeSettings: readingScopeSettingsForProject(state.project),
    sourceProviders,
    contentPreferenceLabel:
      state.project.sourceSettings.contentPreference.join(' -> '),
    qbittorrentConnection: state.ui.qbittorrentConnection,
    qbittorrentStatus: state.ui.qbittorrentStatus,
    exportedCredentialFree:
      !localPassword || !state.ui.importExportText.includes(localPassword),
    qbittorrentLaunchCommand: `npm run qbittorrent:launch -- --daemon --url ${shellQuote(DEFAULT_QBITTORRENT_WEB_UI_URL)} --bridge-url ${shellQuote(state.ui.qbittorrentConnection.baseUrl)} --data-root ${shellQuote(state.ui.qbittorrentConnection.savePath)} --allowed-origin ${shellQuote(allowedOrigins)}`,
    qbittorrentConfigureCommand: `npm run qbittorrent:launch -- --daemon --enable-webui --url ${shellQuote(DEFAULT_QBITTORRENT_WEB_UI_URL)} --bridge-url ${shellQuote(state.ui.qbittorrentConnection.baseUrl)} --data-root ${shellQuote(state.ui.qbittorrentConnection.savePath)} --allowed-origin ${shellQuote(allowedOrigins)}`,
  };
}
