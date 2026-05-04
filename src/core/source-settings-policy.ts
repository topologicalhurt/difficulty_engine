import type {
  BookDocumentRef,
  DocumentSourceKey,
  MetadataSourceKey,
  QbittorrentConnectionSettings,
  SourceSettings,
} from './types';

export function metadataSourceEnabled(
  settings: SourceSettings | undefined,
  source: MetadataSourceKey,
): boolean {
  return settings?.metadataSources[source] !== false;
}

export function documentSourceEnabled(
  settings: SourceSettings | undefined,
  source: DocumentSourceKey,
): boolean {
  return settings?.documentSources[source] !== false;
}

export function qbittorrentDocumentSourceEnabled(settings: SourceSettings | undefined): boolean {
  return settings?.documentSources.qbittorrent === true;
}

export function qbittorrentUserTorrentsEnabled(settings: SourceSettings | undefined): boolean {
  return qbittorrentDocumentSourceEnabled(settings) && settings?.qbittorrent.userProvidedTorrents === true;
}

export function qbittorrentSearchPluginsEnabled(settings: SourceSettings | undefined): boolean {
  return qbittorrentDocumentSourceEnabled(settings) && settings?.qbittorrent.searchPlugins === true;
}

export function qbittorrentRuntimeEnabled(
  settings: SourceSettings,
  connection: QbittorrentConnectionSettings | undefined,
): boolean {
  return qbittorrentDocumentSourceEnabled(settings) && connection?.enabled === true;
}

export function sourceEnabledForDocumentProvider(
  docRef: Pick<BookDocumentRef, 'provider'>,
  settings: SourceSettings,
): boolean {
  const provider = docRef.provider.toLowerCase();
  if (provider === 'qbittorrent') return documentSourceEnabled(settings, 'qbittorrent');
  if (provider === 'internet_archive') return documentSourceEnabled(settings, 'internetArchiveText');
  if (provider === 'direct_url') return documentSourceEnabled(settings, 'directUrl');
  if (provider === 'local_file') return documentSourceEnabled(settings, 'localFile');
  return true;
}
