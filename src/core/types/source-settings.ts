export type MetadataSourceKey =
  | 'openlibrary'
  | 'googleBooks'
  | 'internetArchive';
export type DocumentSourceKey =
  | 'directUrl'
  | 'localFile'
  | 'internetArchiveText'
  | 'qbittorrent';
export type SourceContentKind = 'text' | 'epub' | 'ocr_text' | 'pdf';

export interface SourceProviderMask {
  openlibrary: boolean;
  googleBooks: boolean;
  internetArchive: boolean;
}

export interface DocumentProviderMask {
  directUrl: boolean;
  localFile: boolean;
  internetArchiveText: boolean;
  qbittorrent: boolean;
}

export interface QbittorrentSourceSettings {
  userProvidedTorrents: boolean;
  searchPlugins: boolean;
  allowedPlugins: string[];
  allowedSites: string[];
  categories: string[];
  maxResults: number;
  requireKnownAccessBasis: boolean;
}

export interface SourceSettings {
  metadataSources: SourceProviderMask;
  documentSources: DocumentProviderMask;
  qbittorrent: QbittorrentSourceSettings;
  contentPreference: SourceContentKind[];
}

export interface QbittorrentConnectionSettings {
  enabled: boolean;
  baseUrl: string;
  username: string;
  password: string;
  savePath: string;
  category: string;
  timeoutMs: number;
}

export interface QbittorrentPluginInfo {
  name: string;
  fullName: string;
  enabled: boolean;
  url: string;
  supportedCategories: Array<{ id: string; name: string }>;
}

export interface QbittorrentRuntimeStatus {
  state: 'idle' | 'testing' | 'success' | 'failed' | 'loading_plugins';
  message: string;
  plugins: QbittorrentPluginInfo[];
}
