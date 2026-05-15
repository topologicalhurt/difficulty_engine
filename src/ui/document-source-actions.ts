import type {
  BookDocumentAvailability,
  BookDocumentBlockedCandidateOption,
  BookDocumentRef,
} from '../core/types';
import { isSafeTorrentSource } from '../core/document-source-safety';

export function seedersLabel(
  seeders: number | null | undefined,
  availability?: Pick<BookDocumentAvailability, 'seeders'> | null,
): string {
  const value = seeders ?? availability?.seeders;
  return value == null ? 'unknown seeders' : `${value} seeders`;
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
