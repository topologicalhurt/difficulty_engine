import { describe, expect, it } from 'vitest';

import {
  documentSourceEnabled,
  metadataSourceEnabled,
  qbittorrentRuntimeEnabled,
  qbittorrentSearchPluginsEnabled,
  qbittorrentUserTorrentsEnabled,
  sourceEnabledForDocumentProvider,
} from '../../src/core/source-settings-policy';
import {
  createDefaultQbittorrentConnectionSettings,
  createDefaultSourceSettings,
} from '../../src/core/default-source-settings';
import { normalizeQbittorrentConnectionSettings } from '../../src/core/project-normalize-sources';
import type { BookDocumentRef } from '../../src/core/types';

function document(provider: string): Pick<BookDocumentRef, 'provider'> {
  return { provider };
}

describe('source settings policy', () => {
  it('treats absent optional settings as enabled for metadata and non-qBittorrent document sources', () => {
    expect(metadataSourceEnabled(undefined, 'openlibrary')).toBe(true);
    expect(documentSourceEnabled(undefined, 'directUrl')).toBe(true);
  });

  it('centralizes disabled metadata and document source checks', () => {
    const settings = createDefaultSourceSettings();
    settings.metadataSources.openlibrary = false;
    settings.documentSources.directUrl = false;

    expect(metadataSourceEnabled(settings, 'openlibrary')).toBe(false);
    expect(metadataSourceEnabled(settings, 'googleBooks')).toBe(true);
    expect(documentSourceEnabled(settings, 'directUrl')).toBe(false);
    expect(documentSourceEnabled(settings, 'internetArchiveText')).toBe(true);
  });

  it('requires explicit qBittorrent source and feature enablement', () => {
    const settings = createDefaultSourceSettings();
    const connection = createDefaultQbittorrentConnectionSettings();

    expect(qbittorrentUserTorrentsEnabled(undefined)).toBe(false);
    expect(qbittorrentSearchPluginsEnabled(undefined)).toBe(false);
    expect(qbittorrentRuntimeEnabled(settings, connection)).toBe(false);

    connection.enabled = true;
    expect(qbittorrentRuntimeEnabled(settings, connection)).toBe(true);

    settings.documentSources.qbittorrent = false;
    expect(qbittorrentUserTorrentsEnabled(settings)).toBe(false);
    expect(qbittorrentSearchPluginsEnabled(settings)).toBe(false);
    expect(qbittorrentRuntimeEnabled(settings, connection)).toBe(false);
  });

  it('rejects non-http qBittorrent bridge URLs during normalization', () => {
    const defaults = createDefaultQbittorrentConnectionSettings();

    expect(
      normalizeQbittorrentConnectionSettings({
        baseUrl: 'javascript:alert(1)',
      }).baseUrl,
    ).toBe(defaults.baseUrl);
    expect(
      normalizeQbittorrentConnectionSettings({
        baseUrl: 'https://example.test/bridge',
      }).baseUrl,
    ).toBe('https://example.test/bridge');
  });

  it('maps completed document provider reuse through the document source mask', () => {
    const settings = createDefaultSourceSettings();
    settings.documentSources.qbittorrent = false;
    settings.documentSources.internetArchiveText = false;
    settings.documentSources.directUrl = false;
    settings.documentSources.localFile = false;

    expect(
      sourceEnabledForDocumentProvider(document('qbittorrent'), settings),
    ).toBe(false);
    expect(
      sourceEnabledForDocumentProvider(document('internet_archive'), settings),
    ).toBe(false);
    expect(
      sourceEnabledForDocumentProvider(document('direct_url'), settings),
    ).toBe(false);
    expect(
      sourceEnabledForDocumentProvider(document('local_file'), settings),
    ).toBe(false);
    expect(sourceEnabledForDocumentProvider(document('manual'), settings)).toBe(
      true,
    );
  });
});
