import type {
  BookDocumentAvailability,
  BookDocumentBlockedCandidateOption,
  BookDocumentRef,
} from '../core/types';

export function seedersLabel(
  seeders: number | null | undefined,
  availability?: Pick<BookDocumentAvailability, 'seeders'> | null,
): string {
  const value = seeders ?? availability?.seeders;
  return value == null ? 'unknown seeders' : `${value} seeders`;
}

export function isSafeTorrentSource(value: string): boolean {
  if (/^magnet:/i.test(value)) return true;
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === 'https:' && /\.torrent(?:$|\?)/i.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

export function blockedCandidateCanBeAdded(
  candidate: BookDocumentBlockedCandidateOption,
): boolean {
  return (
    candidate.retryableAsUserOwned === true ||
    isSafeTorrentSource(candidate.sourceUrl)
  );
}

export function documentSourceForRefresh(document: BookDocumentRef): string {
  if (document.sourceUrl && isSafeTorrentSource(document.sourceUrl)) {
    return document.sourceUrl;
  }
  return document.torrentHash
    ? `magnet:?xt=urn:btih:${document.torrentHash}`
    : '';
}
