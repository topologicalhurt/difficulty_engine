import type {
  BookDocumentAvailability,
  BookDocumentBlockedCandidateOption,
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
