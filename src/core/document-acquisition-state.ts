import type {
  BookDocumentAcquisitionState,
  BookDocumentAvailability,
  BookDocumentBlockedCandidateOption,
  BookDocumentCandidateOption,
  BookDocumentGreylistEntry,
  BookDocumentRef,
  BookDocumentSearchAttempt,
  BookDocumentStatus,
} from './types';
import { currentIsoTimestamp } from './time';

export const DOCUMENT_CANDIDATE_QUEUE_LIMIT = 10;
const DOCUMENT_BLOCKED_CANDIDATE_LIMIT = 20;
const DOCUMENT_SEARCH_ATTEMPT_LIMIT = 20;
export const GREYLIST_REQUIRED_STALL_OBSERVATIONS = 2;
const GREYLIST_PENALTY_STEP = 0.18;
const GREYLIST_PENALTY_DECAY = 0.09;
const GREYLIST_MAX_PENALTY = 0.72;
const GREYLIST_MIN_RETAINED_PENALTY = 0.02;

const STALLED_STATE_PATTERN = /(?:stalledDL|error|missingFiles|unknown)/i;
const USER_PAUSED_STATE_PATTERN = /(?:paused|stopped|queued)/i;

export function emptyDocumentAcquisitionState(): BookDocumentAcquisitionState {
  return {
    candidateQueue: [],
    blockedCandidates: [],
    searchAttempts: [],
    greylist: {},
  };
}

function boundedPenalty(value: number): number {
  return Math.max(0, Math.min(GREYLIST_MAX_PENALTY, value));
}

function btihFromText(value: string | undefined): string | null {
  const match = String(value ?? '').match(/btih:([a-z0-9]+)/i);
  return match?.[1]?.toLowerCase() ?? null;
}

function normalizedSourceKey(value: string | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

export function documentGreylistKey(source: {
  sourceUrl?: string;
  greylistKey?: string;
  torrentHash?: string;
  storagePath?: string;
}): string {
  if (source.greylistKey) return source.greylistKey;
  if (source.torrentHash) return `hash:${source.torrentHash.toLowerCase()}`;
  const btih = btihFromText(source.sourceUrl);
  if (btih) return `hash:${btih}`;
  const sourceUrl = normalizedSourceKey(source.sourceUrl);
  if (sourceUrl) return `source:${sourceUrl}`;
  return `path:${normalizedSourceKey(source.storagePath)}`;
}

export function documentGreylistHash(source: {
  sourceUrl?: string;
  greylistKey?: string;
  torrentHash?: string;
}): string | null {
  const key = documentGreylistKey(source);
  return key.startsWith('hash:') ? key.slice('hash:'.length) : null;
}

export function documentRefGreylistKey(docRef: BookDocumentRef): string {
  return documentGreylistKey(docRef);
}

export function documentRefIsTrackedQbittorrentReplacement(
  docRef: BookDocumentRef,
): boolean {
  return Boolean(
    docRef.provider === 'qbittorrent' &&
    docRef.status !== 'failed' &&
    docRef.status !== 'stalled' &&
    docRef.torrentHash?.trim() &&
    docRef.fileIndex != null,
  );
}

function isUnavailable(
  value:
    | Partial<
        Pick<
          BookDocumentAvailability,
          | 'seeders'
          | 'progress'
          | 'state'
          | 'availability'
          | 'downloadSpeedBytesPerSecond'
        >
      >
    | undefined,
): boolean {
  if (!value) return false;
  if (USER_PAUSED_STATE_PATTERN.test(value.state ?? '')) return false;
  const progress = value.progress ?? 0;
  const seeders = value.seeders ?? 0;
  const availability = value.availability ?? 0;
  const speed = value.downloadSpeedBytesPerSecond ?? 0;
  return (
    progress < 1 &&
    seeders <= 0 &&
    availability <= 0 &&
    speed <= 0 &&
    STALLED_STATE_PATTERN.test(value.state ?? '')
  );
}

export function documentRefIsGreylistable(docRef: BookDocumentRef): boolean {
  if (docRef.provider !== 'qbittorrent') return false;
  if (docRef.status !== 'stalled' && docRef.status !== 'failed') {
    return false;
  }
  return isUnavailable(docRef.availability) || docRef.status === 'stalled';
}

function candidateIsCleanObservation(
  candidate: BookDocumentCandidateOption,
): boolean {
  const availability = candidate.availability;
  if (!availability) return (candidate.seeders ?? 0) > 0;
  if (USER_PAUSED_STATE_PATTERN.test(availability.state ?? '')) return false;
  return (
    (candidate.seeders ?? availability.seeders ?? 0) > 0 ||
    (availability.availability ?? 0) > 0 ||
    (availability.downloadSpeedBytesPerSecond ?? 0) > 0 ||
    (availability.progress ?? 0) >= 1
  );
}

function greylistReason(
  status: BookDocumentStatus | 'candidate',
  fallback?: string,
): string {
  return fallback || `Greylisted after repeated ${status} download evidence.`;
}

function nextGreylistEntry(
  previous: BookDocumentGreylistEntry | undefined,
  source: {
    key: string;
    status: BookDocumentStatus | 'candidate';
    reason?: string;
    sourceUrl?: string;
    torrentHash?: string;
    title?: string;
    progress?: number;
  },
  now: string,
): BookDocumentGreylistEntry {
  const observations = (previous?.observations ?? 0) + 1;
  const shouldPenalize = observations >= GREYLIST_REQUIRED_STALL_OBSERVATIONS;
  const progress = Math.max(0, Math.min(1, source.progress ?? 0));
  const lastProgress =
    previous?.lastProgress == null
      ? progress
      : Math.max(previous.lastProgress, progress);
  return {
    key: source.key,
    penalty: shouldPenalize
      ? boundedPenalty((previous?.penalty ?? 0) + GREYLIST_PENALTY_STEP)
      : (previous?.penalty ?? 0),
    observations,
    lastStatus: source.status,
    lastReason: greylistReason(source.status, source.reason),
    lastProgress,
    lastProgressAt:
      progress > (previous?.lastProgress ?? -1)
        ? now
        : (previous?.lastProgressAt ?? now),
    sourceUrl: source.sourceUrl,
    torrentHash: source.torrentHash,
    title: source.title,
    updatedAt: now,
  };
}

function fallbackCandidateQuality(
  candidate: BookDocumentCandidateOption,
): number {
  const seeders = candidate.seeders ?? candidate.availability?.seeders ?? 0;
  const seederScore = Math.min(
    1,
    Math.log1p(Math.max(0, seeders)) / Math.log1p(60),
  );
  const availabilityScore = Math.max(
    0,
    Math.min(1, candidate.availability?.availability ?? 0),
  );
  const progressScore = Math.max(
    0,
    Math.min(1, candidate.availability?.progress ?? 0),
  );
  return (
    (candidate.matchScore ?? candidate.confidence) * 0.6 +
    seederScore * 0.25 +
    Math.max(availabilityScore, progressScore) * 0.15
  );
}

export function observeDocumentGreylist(
  state: BookDocumentAcquisitionState | undefined,
  documents: BookDocumentRef[] = [],
  now = currentIsoTimestamp(),
): BookDocumentAcquisitionState {
  const next = normalizeDocumentAcquisitionState(state);
  let changed = false;
  documents.forEach((docRef) => {
    const key = documentRefGreylistKey(docRef);
    if (!key) return;
    if (!documentRefIsGreylistable(docRef)) return;
    next.greylist[key] = nextGreylistEntry(
      next.greylist[key],
      {
        key,
        status: docRef.status,
        reason: docRef.availability.reason,
        sourceUrl: docRef.sourceUrl,
        torrentHash: docRef.torrentHash,
        title: docRef.fileName,
        progress: docRef.availability.progress,
      },
      now,
    );
    changed = true;
  });
  return changed ? { ...next, updatedAt: now } : next;
}

export function documentRefHasActiveGreylist(
  state: BookDocumentAcquisitionState | undefined,
  docRef: BookDocumentRef,
): boolean {
  const entry =
    normalizeDocumentAcquisitionState(state).greylist[
      documentRefGreylistKey(docRef)
    ];
  return Boolean(
    entry &&
    (entry.penalty > 0 ||
      entry.observations >= GREYLIST_REQUIRED_STALL_OBSERVATIONS),
  );
}

export function documentRefShouldBeReplaced(
  docRef: BookDocumentRef,
  state: BookDocumentAcquisitionState | undefined,
): boolean {
  return (
    documentRefIsGreylistable(docRef) ||
    documentRefHasActiveGreylist(state, docRef)
  );
}

function decayEntry(
  entry: BookDocumentGreylistEntry,
  now: string,
): BookDocumentGreylistEntry | null {
  const penalty = boundedPenalty(entry.penalty - GREYLIST_PENALTY_DECAY);
  if (penalty < GREYLIST_MIN_RETAINED_PENALTY) return null;
  return { ...entry, penalty, updatedAt: now };
}

export function mergeDocumentCandidateQueue(
  state: BookDocumentAcquisitionState | undefined,
  candidates: BookDocumentCandidateOption[],
  diagnosticsOrNow:
    | {
        blockedCandidates?: BookDocumentBlockedCandidateOption[];
        searchAttempts?: BookDocumentSearchAttempt[];
      }
    | string = {},
  now = typeof diagnosticsOrNow === 'string'
    ? diagnosticsOrNow
    : currentIsoTimestamp(),
): BookDocumentAcquisitionState {
  const diagnostics =
    typeof diagnosticsOrNow === 'string' ? {} : diagnosticsOrNow;
  const next = normalizeDocumentAcquisitionState(state);
  const greylist = { ...next.greylist };
  candidates.forEach((candidate) => {
    const key = documentGreylistKey(candidate);
    if (!key) return;
    if (isUnavailable(candidate.availability)) {
      greylist[key] = nextGreylistEntry(
        greylist[key],
        {
          key,
          status: 'candidate',
          reason: candidate.availability?.reason,
          sourceUrl: candidate.sourceUrl,
          title: candidate.title,
          progress: candidate.availability?.progress,
        },
        now,
      );
      return;
    }
    if (!greylist[key] || !candidateIsCleanObservation(candidate)) return;
    const decayed = decayEntry(greylist[key], now);
    if (decayed) greylist[key] = decayed;
    else delete greylist[key];
  });

  const freshCandidates = new Set(candidates);
  const byKey = new Map<string, BookDocumentCandidateOption>();
  const freshByKey = new Map<string, boolean>();
  [...next.candidateQueue, ...candidates].forEach((candidate) => {
    const key = documentGreylistKey(candidate);
    if (!key) return;
    const isFresh = freshCandidates.has(candidate);
    const entry = greylist[key];
    const queuedAt = candidate.queuedAt ?? now;
    const lastSeenAt = isFresh ? now : (candidate.lastSeenAt ?? queuedAt);
    const penalty = entry?.penalty ?? 0;
    const baseQuality =
      candidate.qualityScore == null
        ? fallbackCandidateQuality(candidate)
        : candidate.qualityScore + (candidate.greylistPenalty ?? 0);
    const queued: BookDocumentCandidateOption = {
      ...candidate,
      greylistKey: key,
      greylistPenalty: penalty,
      greylistReason: entry?.lastReason,
      qualityScore: Math.max(0, baseQuality - penalty),
      retryable: true,
      queuedAt,
      lastSeenAt,
    };
    const previous = byKey.get(key);
    const previousIsFresh = freshByKey.get(key) ?? false;
    if (
      !previous ||
      (isFresh && !previousIsFresh) ||
      (isFresh === previousIsFresh &&
        compareQueuedCandidates(queued, previous) < 0)
    ) {
      byKey.set(key, queued);
      freshByKey.set(key, isFresh);
    }
  });

  const candidateQueue = [...byKey.values()]
    .sort(compareQueuedCandidates)
    .slice(0, DOCUMENT_CANDIDATE_QUEUE_LIMIT)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));

  return {
    candidateQueue,
    blockedCandidates: mergeBlockedCandidates(
      next.blockedCandidates,
      diagnostics.blockedCandidates,
    ),
    searchAttempts: mergeSearchAttempts(
      next.searchAttempts,
      diagnostics.searchAttempts,
    ),
    greylist,
    updatedAt: now,
    lastDiagnostic: candidateQueue.length
      ? `Tracked ${candidateQueue.length} ranked document candidate(s).`
      : diagnostics.blockedCandidates?.length
        ? `Found ${diagnostics.blockedCandidates.length} blocked qBittorrent result(s).`
        : next.lastDiagnostic,
  };
}

function mergeBlockedCandidates(
  existing: BookDocumentBlockedCandidateOption[] = [],
  incoming: BookDocumentBlockedCandidateOption[] = [],
): BookDocumentBlockedCandidateOption[] {
  const byKey = new Map<string, BookDocumentBlockedCandidateOption>();
  [...existing, ...incoming].forEach((candidate) => {
    const key = `${candidate.sourceUrl.toLowerCase()}|${candidate.title.toLowerCase()}`;
    const previous = byKey.get(key);
    if (
      !previous ||
      (candidate.seeders ?? 0) > (previous.seeders ?? 0) ||
      (candidate.matchScore ?? 0) > (previous.matchScore ?? 0)
    ) {
      byKey.set(key, candidate);
    }
  });
  return [...byKey.values()]
    .sort(compareBlockedCandidates)
    .slice(0, DOCUMENT_BLOCKED_CANDIDATE_LIMIT);
}

function compareBlockedCandidates(
  left: BookDocumentBlockedCandidateOption,
  right: BookDocumentBlockedCandidateOption,
): number {
  return (
    Number(right.retryableAsUserOwned) - Number(left.retryableAsUserOwned) ||
    (right.matchScore ?? 0) - (left.matchScore ?? 0) ||
    (right.seeders ?? 0) - (left.seeders ?? 0) ||
    left.title.localeCompare(right.title) ||
    left.id.localeCompare(right.id)
  );
}

function mergeSearchAttempts(
  existing: BookDocumentSearchAttempt[] = [],
  incoming: BookDocumentSearchAttempt[] = [],
): BookDocumentSearchAttempt[] {
  return [...incoming, ...existing]
    .sort(
      (left, right) =>
        right.createdAt.localeCompare(left.createdAt) ||
        left.id.localeCompare(right.id),
    )
    .slice(0, DOCUMENT_SEARCH_ATTEMPT_LIMIT);
}

export function clearDocumentAcquisitionState(): BookDocumentAcquisitionState {
  return emptyDocumentAcquisitionState();
}

export function normalizeDocumentAcquisitionState(
  state: BookDocumentAcquisitionState | undefined,
): BookDocumentAcquisitionState {
  const greylist = state?.greylist ?? {};
  const normalizedGreylist = Object.fromEntries(
    Object.entries(greylist)
      .filter(([, entry]) => entry?.key)
      .map(([key, entry]) => [
        entry.key || key,
        {
          ...entry,
          key: entry.key || key,
          penalty: boundedPenalty(Number(entry.penalty) || 0),
          observations: Math.max(
            0,
            Math.round(Number(entry.observations) || 0),
          ),
          lastProgress:
            entry.lastProgress == null
              ? undefined
              : Math.max(0, Math.min(1, Number(entry.lastProgress) || 0)),
          lastProgressAt: entry.lastProgressAt,
          updatedAt: entry.updatedAt || currentIsoTimestamp(),
        },
      ]),
  );
  const candidateQueue = (state?.candidateQueue ?? [])
    .filter((candidate) => candidate.id && candidate.sourceUrl)
    .map((candidate) => {
      const key = documentGreylistKey(candidate);
      const penalty = normalizedGreylist[key]?.penalty ?? 0;
      return {
        ...candidate,
        greylistKey: key,
        greylistPenalty: penalty,
        greylistReason: normalizedGreylist[key]?.lastReason,
        qualityScore: Math.max(0, candidate.qualityScore ?? 0),
        retryable: candidate.retryable ?? true,
      };
    })
    .sort(compareQueuedCandidates)
    .slice(0, DOCUMENT_CANDIDATE_QUEUE_LIMIT)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
  return {
    candidateQueue,
    blockedCandidates: mergeBlockedCandidates(state?.blockedCandidates),
    searchAttempts: mergeSearchAttempts(state?.searchAttempts),
    greylist: normalizedGreylist,
    lastDiagnostic: state?.lastDiagnostic,
    updatedAt: state?.updatedAt,
  };
}

function compareQueuedCandidates(
  left: BookDocumentCandidateOption,
  right: BookDocumentCandidateOption,
): number {
  return (
    (right.qualityScore ?? 0) - (left.qualityScore ?? 0) ||
    (right.matchScore ?? 0) - (left.matchScore ?? 0) ||
    (right.seeders ?? right.availability?.seeders ?? 0) -
      (left.seeders ?? left.availability?.seeders ?? 0) ||
    left.title.localeCompare(right.title) ||
    left.id.localeCompare(right.id)
  );
}
