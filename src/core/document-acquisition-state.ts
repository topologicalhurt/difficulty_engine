import type {
  BookDocumentAcquisitionState,
  BookDocumentAvailability,
  BookDocumentCandidateOption,
  BookDocumentGreylistEntry,
  BookDocumentRef,
  BookDocumentStatus,
} from './types';
import { currentIsoTimestamp } from './time';

export const DOCUMENT_CANDIDATE_QUEUE_LIMIT = 10;
const GREYLIST_PENALTY_STEP = 0.18;
const GREYLIST_PENALTY_DECAY = 0.09;
const GREYLIST_MAX_PENALTY = 0.72;
const GREYLIST_MIN_RETAINED_PENALTY = 0.02;

const STALLED_STATE_PATTERN = /(?:stalledDL|error|missingFiles|unknown)/i;
const USER_PAUSED_STATE_PATTERN = /(?:paused|stopped|queued)/i;

export function emptyDocumentAcquisitionState(): BookDocumentAcquisitionState {
  return { candidateQueue: [], greylist: {} };
}

function boundedPenalty(value: number): number {
  return Math.max(0, Math.min(GREYLIST_MAX_PENALTY, value));
}

function btihFromText(value: string | undefined): string | null {
  const match = String(value ?? '').match(/btih:([a-z0-9]+)/i);
  return match?.[1]?.toLowerCase() ?? null;
}

function normalizedSourceKey(value: string | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

export function documentGreylistKey(
  source: {
    sourceUrl?: string;
    greylistKey?: string;
    torrentHash?: string;
    storagePath?: string;
  },
): string {
  if (source.greylistKey) return source.greylistKey;
  if (source.torrentHash) return `hash:${source.torrentHash.toLowerCase()}`;
  const btih = btihFromText(source.sourceUrl);
  if (btih) return `hash:${btih}`;
  const sourceUrl = normalizedSourceKey(source.sourceUrl);
  if (sourceUrl) return `source:${sourceUrl}`;
  return `path:${normalizedSourceKey(source.storagePath)}`;
}

export function documentRefGreylistKey(docRef: BookDocumentRef): string {
  return documentGreylistKey(docRef);
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

function fallbackCandidateQuality(candidate: BookDocumentCandidateOption): number {
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
    const previous = next.greylist[key];
    next.greylist[key] = {
      key,
      penalty: boundedPenalty(
        (previous?.penalty ?? 0) + GREYLIST_PENALTY_STEP,
      ),
      observations: (previous?.observations ?? 0) + 1,
      lastStatus: docRef.status,
      lastReason: greylistReason(docRef.status, docRef.availability.reason),
      sourceUrl: docRef.sourceUrl,
      torrentHash: docRef.torrentHash,
      title: docRef.fileName,
      updatedAt: now,
    };
    changed = true;
  });
  return changed ? { ...next, updatedAt: now } : next;
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
  now = currentIsoTimestamp(),
): BookDocumentAcquisitionState {
  const next = normalizeDocumentAcquisitionState(state);
  const greylist = { ...next.greylist };
  candidates.forEach((candidate) => {
    const key = documentGreylistKey(candidate);
    if (!key || !greylist[key] || !candidateIsCleanObservation(candidate)) {
      return;
    }
    const decayed = decayEntry(greylist[key], now);
    if (decayed) greylist[key] = decayed;
    else delete greylist[key];
  });

  const byKey = new Map<string, BookDocumentCandidateOption>();
  [...next.candidateQueue, ...candidates].forEach((candidate) => {
    const key = documentGreylistKey(candidate);
    if (!key) return;
    const entry = greylist[key];
    const queuedAt = candidate.queuedAt ?? now;
    const lastSeenAt = candidates.some((item) => item.id === candidate.id)
      ? now
      : (candidate.lastSeenAt ?? queuedAt);
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
    if (!previous || compareQueuedCandidates(queued, previous) < 0) {
      byKey.set(key, queued);
    }
  });

  const candidateQueue = [...byKey.values()]
    .sort(compareQueuedCandidates)
    .slice(0, DOCUMENT_CANDIDATE_QUEUE_LIMIT)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));

  return {
    candidateQueue,
    greylist,
    updatedAt: now,
    lastDiagnostic: candidateQueue.length
      ? `Tracked ${candidateQueue.length} ranked document candidate(s).`
      : next.lastDiagnostic,
  };
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
          observations: Math.max(0, Math.round(Number(entry.observations) || 0)),
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
