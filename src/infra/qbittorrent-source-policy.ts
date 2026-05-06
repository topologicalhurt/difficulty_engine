import type { QbittorrentPluginInfo } from '../core/types';
import { compactJoin } from '../core/utils';
import type {
  DocumentAcquisitionRequest,
  DocumentCandidate,
} from './document-acquisition';
import type { SearchResult } from './qbittorrent-types';

const OPEN_ACCESS_PATTERN =
  /\b(?:open[\s_-]*access|public[\s_-]*domain|creative\s+commons|cc0|cc[\s_-]*by|cc[\s_-]*by[\s_-]*sa)\b/i;
const USER_OWNED_PATTERN = /\buser[\s_-]*owned\b/i;
const USER_PROVIDED_PATTERN = /\buser[\s_-]*provided\b/i;

export function hostFromUrl(value: string): string {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function sourceIsAllowed(
  value: string,
  allowedSites: string[],
): boolean {
  const host = hostFromUrl(value);
  return Boolean(
    host &&
      allowedSites.some((site) => {
        const normalized = site
          .toLowerCase()
          .replace(/^https?:\/\//, '')
          .replace(/\/.*$/, '');
        return host === normalized || host.endsWith(`.${normalized}`);
      }),
  );
}

function normalizedExplicitAccessBasis(
  value: string | undefined,
): DocumentCandidate['accessBasis'] {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (
    normalized === 'public_domain' ||
    normalized === 'open_access' ||
    normalized === 'user_owned' ||
    normalized === 'user_provided'
  ) {
    return normalized;
  }
  return undefined;
}

function accessBasisFromResultMetadata(
  result: SearchResult,
): DocumentCandidate['accessBasis'] {
  const explicit = normalizedExplicitAccessBasis(result.accessBasis);
  if (explicit) return explicit;
  const metadata = compactJoin([result.license, result.rights], ' ');
  if (USER_OWNED_PATTERN.test(metadata)) return 'user_owned';
  if (USER_PROVIDED_PATTERN.test(metadata)) return 'user_provided';
  if (OPEN_ACCESS_PATTERN.test(metadata)) return 'open_access';
  return undefined;
}

export function accessBasisForSearchResult(
  result: SearchResult,
  pluginName: string,
  request: DocumentAcquisitionRequest,
): DocumentCandidate['accessBasis'] {
  const settings = request.policy.sourceSettings?.qbittorrent;
  if (!settings) return undefined;
  const sourceAllowed =
    settings.allowedPlugins.includes(pluginName) ||
    sourceIsAllowed(
      result.siteUrl ?? result.descrLink ?? result.fileUrl ?? '',
      settings.allowedSites,
    );
  if (!sourceAllowed) return undefined;
  const explicit = accessBasisFromResultMetadata(result);
  if (explicit) return explicit;
  return settings.requireKnownAccessBasis ? undefined : 'user_provided';
}

export function pluginIsAllowed(
  plugin: QbittorrentPluginInfo,
  settings: NonNullable<
    DocumentAcquisitionRequest['policy']['sourceSettings']
  >['qbittorrent'],
): boolean {
  return (
    settings.allowedPlugins.includes(plugin.name) ||
    sourceIsAllowed(plugin.url, settings.allowedSites)
  );
}
