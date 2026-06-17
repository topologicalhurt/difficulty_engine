import type {
  BookDocumentAvailability,
  BookDocumentAvailabilitySource,
  BookDocumentSearchAvailability,
} from './types';

export interface DocumentCandidateAvailabilityLike {
  seeders?: number | null;
  peers?: number | null;
  availability?: BookDocumentAvailability;
  availabilitySource?: BookDocumentAvailabilitySource;
  searchAvailability?: BookDocumentSearchAvailability;
}

const SEARCH_ONLY_STATES = new Set([
  'search-result',
  'blocked-search-result',
]);

export function candidateHasLiveAvailability(
  candidate: DocumentCandidateAvailabilityLike,
): boolean {
  if (candidate.availabilitySource === 'live_qbit') return true;
  if (candidate.availabilitySource === 'search_result') return false;
  const state = candidate.availability?.state;
  return Boolean(state && !SEARCH_ONLY_STATES.has(state));
}

export function candidateLiveSeeders(
  candidate: DocumentCandidateAvailabilityLike,
): number | null {
  return candidateHasLiveAvailability(candidate)
    ? (candidate.availability?.seeders ?? null)
    : null;
}

export function candidateSearchSeeders(
  candidate: DocumentCandidateAvailabilityLike,
): number | null {
  const explicit = candidate.searchAvailability?.seeders;
  if (explicit != null) return explicit;
  return candidateHasLiveAvailability(candidate)
    ? null
    : (candidate.seeders ?? candidate.availability?.seeders ?? null);
}

export function candidateRankingSeeders(
  candidate: DocumentCandidateAvailabilityLike,
): number {
  return candidateLiveSeeders(candidate) ?? candidateSearchSeeders(candidate) ?? 0;
}

export function candidatePeersForDisplay(
  candidate: DocumentCandidateAvailabilityLike,
): number | null {
  if (candidateHasLiveAvailability(candidate)) {
    return candidate.availability?.peers ?? null;
  }
  return (
    candidate.searchAvailability?.peers ??
    candidate.peers ??
    candidate.availability?.peers ??
    null
  );
}

// Canonical "this torrent has live download activity" check (peers/seeders/
// availability/speed). Shared by stall detection, greylist availability, and
// candidate evidence so the threshold arithmetic can't drift between them.
export function availabilityHasLiveDownloadActivity(
  availability:
    | {
        seeders?: number | null;
        availability?: number | null;
        downloadSpeedBytesPerSecond?: number | null;
      }
    | null
    | undefined,
): boolean {
  return (
    (availability?.seeders ?? 0) > 0 ||
    (availability?.availability ?? 0) > 0 ||
    (availability?.downloadSpeedBytesPerSecond ?? 0) > 0
  );
}

export function candidateHasPositiveDownloadEvidence(
  candidate: DocumentCandidateAvailabilityLike,
): boolean {
  const availability = candidate.availability;
  if (candidateHasLiveAvailability(candidate)) {
    return (
      availabilityHasLiveDownloadActivity(availability) ||
      (availability?.progress ?? 0) >= 1
    );
  }
  return (candidateSearchSeeders(candidate) ?? 0) > 0;
}
