import { normalizeProvenance } from './project-normalize-provenance';
import type {
  BookDocumentAcquisitionState,
  BookDocumentAvailability,
  BookDocumentBlockedCandidateOption,
  BookDocumentCandidateOption,
  BookDocumentGreylistEntry,
  BookDocumentRef,
  BookDocumentSearchAttempt,
  BookDocumentStatus,
  QbittorrentSearchIntent,
  SourceContentKind,
} from './types';
import { compactItems, safeNumber } from './utils';
import {
  normalizeNumber,
  normalizeString,
} from './project-normalize-primitives';
import { EPOCH_ISO_TIMESTAMP } from './time';
import {
  DOCUMENT_CANDIDATE_QUEUE_LIMIT,
  documentGreylistKey,
} from './document-acquisition-state';

function normalizeDocumentStatus(
  value: unknown,
  contentKind: SourceContentKind,
): BookDocumentStatus {
  const normalized =
    value === 'queued' ||
    value === 'downloading' ||
    value === 'complete' ||
    value === 'failed' ||
    value === 'stalled' ||
    value === 'unreadable'
      ? value
      : 'queued';
  return normalized === 'unreadable' && contentKind === 'pdf'
    ? 'complete'
    : normalized;
}

function normalizeContentKind(value: unknown): SourceContentKind {
  return value === 'text' ||
    value === 'epub' ||
    value === 'ocr_text' ||
    value === 'pdf'
    ? value
    : 'pdf';
}

function normalizeDocumentAvailability(
  value: unknown,
): BookDocumentAvailability {
  const raw =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  const nullableCount = (input: unknown): number | null =>
    input == null || input === ''
      ? null
      : Math.max(0, Math.round(safeNumber(input, 0)));
  return {
    seeders: nullableCount(raw.seeders),
    peers: nullableCount(raw.peers),
    progress: normalizeNumber(raw.progress, 0, 0, 1),
    state: normalizeString(raw.state),
    etaSeconds:
      raw.etaSeconds == null
        ? null
        : normalizeNumber(raw.etaSeconds, 0, 0, 365 * 24 * 60 * 60),
    downloadSpeedBytesPerSecond:
      raw.downloadSpeedBytesPerSecond == null
        ? null
        : normalizeNumber(raw.downloadSpeedBytesPerSecond, 0, 0),
    availability:
      raw.availability == null ? null : normalizeNumber(raw.availability, 0, 0),
    sizeBytes:
      raw.sizeBytes == null ? null : normalizeNumber(raw.sizeBytes, 0, 0),
    qualityScore:
      raw.qualityScore == null
        ? undefined
        : normalizeNumber(raw.qualityScore, 0, 0, 1),
    reason: normalizeString(raw.reason) || undefined,
  };
}

function normalizeCandidateOption(
  input: unknown,
): BookDocumentCandidateOption | null {
  const raw =
    input && typeof input === 'object'
      ? (input as Record<string, unknown>)
      : {};
  const id = normalizeString(raw.id);
  const sourceUrl = normalizeString(raw.sourceUrl);
  const title = normalizeString(raw.title);
  if (!id || !sourceUrl || !title) return null;
  const candidate: BookDocumentCandidateOption = {
    id,
    provider: normalizeString(raw.provider, 'qbittorrent') || 'qbittorrent',
    title,
    sourceUrl,
    contentKind:
      raw.contentKind === 'text' ||
      raw.contentKind === 'epub' ||
      raw.contentKind === 'ocr_text' ||
      raw.contentKind === 'pdf' ||
      raw.contentKind === 'unknown'
        ? raw.contentKind
        : 'unknown',
    accessBasis:
      raw.accessBasis === 'public_domain' ||
      raw.accessBasis === 'open_access' ||
      raw.accessBasis === 'user_owned' ||
      raw.accessBasis === 'user_provided'
        ? raw.accessBasis
        : undefined,
    confidence: normalizeNumber(raw.confidence, 0, 0, 1),
    sizeBytes:
      raw.sizeBytes == null ? undefined : normalizeNumber(raw.sizeBytes, 0, 0),
    seeders:
      raw.seeders == null
        ? null
        : normalizeNumber(raw.seeders, 0, 0, 100000, true),
    peers:
      raw.peers == null ? null : normalizeNumber(raw.peers, 0, 0, 100000, true),
    matchScore:
      raw.matchScore == null
        ? undefined
        : normalizeNumber(raw.matchScore, 0, 0, 1),
    qualityScore:
      raw.qualityScore == null
        ? undefined
        : normalizeNumber(raw.qualityScore, 0, 0, 1),
    qualityReason: normalizeString(raw.qualityReason) || undefined,
    greylistKey: normalizeString(raw.greylistKey) || undefined,
    greylistPenalty:
      raw.greylistPenalty == null
        ? undefined
        : normalizeNumber(raw.greylistPenalty, 0, 0, 1),
    greylistReason: normalizeString(raw.greylistReason) || undefined,
    rank:
      raw.rank == null
        ? undefined
        : normalizeNumber(raw.rank, 0, 0, 1000, true),
    retryable: raw.retryable == null ? true : Boolean(raw.retryable),
    queuedAt: normalizeString(raw.queuedAt) || undefined,
    lastSeenAt: normalizeString(raw.lastSeenAt) || undefined,
    availability: normalizeDocumentAvailability(raw.availability),
  };
  return {
    ...candidate,
    greylistKey: documentGreylistKey(candidate),
  };
}

function normalizeSearchIntent(value: unknown): QbittorrentSearchIntent {
  return value === 'isbn_exact' ||
    value === 'core_title' ||
    value === 'core_title_author' ||
    value === 'author_topic' ||
    value === 'hyphenated_title' ||
    value === 'broad_recall'
    ? value
    : 'broad_recall';
}

function normalizeBlockedCandidateOption(
  input: unknown,
): BookDocumentBlockedCandidateOption | null {
  const raw =
    input && typeof input === 'object'
      ? (input as Record<string, unknown>)
      : {};
  const id = normalizeString(raw.id);
  const sourceUrl = normalizeString(raw.sourceUrl);
  const title = normalizeString(raw.title);
  if (!id || !sourceUrl || !title) return null;
  const blockedReasons = Array.isArray(raw.blockedReasons)
    ? compactItems(raw.blockedReasons.map((reason) => normalizeString(reason)))
    : [];
  return {
    id,
    provider: normalizeString(raw.provider, 'qbittorrent') || 'qbittorrent',
    title,
    sourceUrl,
    contentKind:
      raw.contentKind === 'text' ||
      raw.contentKind === 'epub' ||
      raw.contentKind === 'ocr_text' ||
      raw.contentKind === 'pdf' ||
      raw.contentKind === 'unknown'
        ? raw.contentKind
        : 'unknown',
    confidence: normalizeNumber(raw.confidence, 0, 0, 1),
    blockedReasons,
    searchIntent:
      raw.searchIntent == null
        ? undefined
        : normalizeSearchIntent(raw.searchIntent),
    pattern: normalizeString(raw.pattern) || undefined,
    plugin: normalizeString(raw.plugin) || undefined,
    siteUrl: normalizeString(raw.siteUrl) || undefined,
    seeders:
      raw.seeders == null
        ? null
        : normalizeNumber(raw.seeders, 0, 0, 100000, true),
    peers:
      raw.peers == null ? null : normalizeNumber(raw.peers, 0, 0, 100000, true),
    matchScore:
      raw.matchScore == null
        ? undefined
        : normalizeNumber(raw.matchScore, 0, 0, 1),
    qualityScore:
      raw.qualityScore == null
        ? undefined
        : normalizeNumber(raw.qualityScore, 0, 0, 1),
    qualityReason: normalizeString(raw.qualityReason) || undefined,
    retryableAsUserOwned: Boolean(raw.retryableAsUserOwned),
    sizeBytes:
      raw.sizeBytes == null ? undefined : normalizeNumber(raw.sizeBytes, 0, 0),
    availability: normalizeDocumentAvailability(raw.availability),
  };
}

function normalizeSearchAttempt(
  input: unknown,
): BookDocumentSearchAttempt | null {
  const raw =
    input && typeof input === 'object'
      ? (input as Record<string, unknown>)
      : {};
  const id = normalizeString(raw.id);
  const pattern = normalizeString(raw.pattern);
  if (!id || !pattern) return null;
  const rejectedReasons = Array.isArray(raw.rejectedReasons)
    ? compactItems(raw.rejectedReasons.map((reason) => normalizeString(reason)))
    : [];
  return {
    id,
    provider: 'qbittorrent',
    intent: normalizeSearchIntent(raw.intent),
    pattern,
    plugins: normalizeString(raw.plugins),
    category: normalizeString(raw.category, 'all') || 'all',
    resultCount: normalizeNumber(raw.resultCount, 0, 0, 100000, true),
    acceptedCount: normalizeNumber(raw.acceptedCount, 0, 0, 100000, true),
    blockedCount: normalizeNumber(raw.blockedCount, 0, 0, 100000, true),
    pollDurationMs: normalizeNumber(raw.pollDurationMs, 0, 0, 60 * 60 * 1000),
    status: normalizeString(raw.status) || undefined,
    error: normalizeString(raw.error) || undefined,
    rejectedReasons,
    createdAt: normalizeString(raw.createdAt) || EPOCH_ISO_TIMESTAMP,
  };
}

function normalizeGreylistEntry(
  key: string,
  input: unknown,
): BookDocumentGreylistEntry | null {
  const raw =
    input && typeof input === 'object'
      ? (input as Record<string, unknown>)
      : {};
  const normalizedKey = normalizeString(raw.key, key);
  if (!normalizedKey) return null;
  const lastStatus =
    raw.lastStatus === 'queued' ||
    raw.lastStatus === 'downloading' ||
    raw.lastStatus === 'complete' ||
    raw.lastStatus === 'failed' ||
    raw.lastStatus === 'stalled' ||
    raw.lastStatus === 'unreadable' ||
    raw.lastStatus === 'candidate'
      ? raw.lastStatus
      : 'candidate';
  return {
    key: normalizedKey,
    penalty: normalizeNumber(raw.penalty, 0, 0, 1),
    observations: normalizeNumber(raw.observations, 0, 0, 10000, true),
    lastStatus,
    lastReason: normalizeString(raw.lastReason) || undefined,
    lastProgress:
      raw.lastProgress == null
        ? undefined
        : normalizeNumber(raw.lastProgress, 0, 0, 1),
    lastProgressAt: normalizeString(raw.lastProgressAt) || undefined,
    sourceUrl: normalizeString(raw.sourceUrl) || undefined,
    torrentHash: normalizeString(raw.torrentHash) || undefined,
    title: normalizeString(raw.title) || undefined,
    updatedAt: normalizeString(raw.updatedAt) || EPOCH_ISO_TIMESTAMP,
  };
}

export function normalizeBookDocumentAcquisition(
  input: unknown,
): BookDocumentAcquisitionState {
  const raw =
    input && typeof input === 'object'
      ? (input as Record<string, unknown>)
      : {};
  const greylistInput =
    raw.greylist && typeof raw.greylist === 'object'
      ? (raw.greylist as Record<string, unknown>)
      : {};
  const greylist = Object.fromEntries(
    compactItems(
      Object.entries(greylistInput).map(([key, entry]) =>
        normalizeGreylistEntry(key, entry),
      ),
    ).map((entry) => [entry.key, entry]),
  );
  const candidateQueue = Array.isArray(raw.candidateQueue)
    ? compactItems(raw.candidateQueue.map(normalizeCandidateOption))
        .slice(0, DOCUMENT_CANDIDATE_QUEUE_LIMIT)
        .map((candidate, index) => ({ ...candidate, rank: index + 1 }))
    : [];
  const blockedCandidates = Array.isArray(raw.blockedCandidates)
    ? compactItems(raw.blockedCandidates.map(normalizeBlockedCandidateOption))
    : [];
  const searchAttempts = Array.isArray(raw.searchAttempts)
    ? compactItems(raw.searchAttempts.map(normalizeSearchAttempt))
    : [];
  return {
    candidateQueue,
    blockedCandidates,
    searchAttempts,
    greylist,
    lastDiagnostic: normalizeString(raw.lastDiagnostic) || undefined,
    updatedAt: normalizeString(raw.updatedAt) || undefined,
  };
}

function projectDocumentStatusPriority(status: BookDocumentStatus): number {
  if (status === 'complete') return 0;
  if (status === 'downloading') return 1;
  if (status === 'queued') return 2;
  if (status === 'stalled') return 3;
  if (status === 'unreadable') return 4;
  return 5;
}

function compareDocumentPreference(
  left: BookDocumentRef,
  right: BookDocumentRef,
): number {
  return (
    projectDocumentStatusPriority(left.status) -
      projectDocumentStatusPriority(right.status) ||
    (right.availability.progress ?? 0) - (left.availability.progress ?? 0) ||
    (right.availability.seeders ?? 0) - (left.availability.seeders ?? 0) ||
    right.matchScore - left.matchScore ||
    right.updatedAt.localeCompare(left.updatedAt) ||
    left.id.localeCompare(right.id)
  );
}

function canonicalizeQbittorrentDocuments(
  documents: BookDocumentRef[],
): BookDocumentRef[] {
  const qbitDocuments = documents.filter(
    (doc) => doc.provider === 'qbittorrent',
  );
  if (qbitDocuments.length <= 1) return documents;
  const others = documents.filter((doc) => doc.provider !== 'qbittorrent');
  const [preferred] = [...qbitDocuments].sort(compareDocumentPreference);
  return preferred ? [...others, preferred] : others;
}

export function normalizeBookDocuments(input: unknown): BookDocumentRef[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  return canonicalizeQbittorrentDocuments(
    compactItems(
      input.map((entry, index): BookDocumentRef | null => {
        const raw =
          entry && typeof entry === 'object'
            ? (entry as Record<string, unknown>)
            : {};
        const storagePath = normalizeString(raw.storagePath);
        const fileName =
          normalizeString(raw.fileName) ||
          storagePath.split('/').filter(Boolean).at(-1) ||
          '';
        if (!storagePath || !fileName) return null;
        const id =
          normalizeString(raw.id) ||
          `${normalizeString(raw.provider, 'document')}:${storagePath}`;
        if (seen.has(id)) return null;
        seen.add(id);
        const contentKind = normalizeContentKind(raw.contentKind);
        const provenance = normalizeProvenance(raw.provenance) ?? {
          provider: normalizeString(raw.provider, 'document') || 'document',
          sourceUrl: normalizeString(raw.sourceUrl) || undefined,
          fetchedAt: normalizeString(raw.updatedAt) || EPOCH_ISO_TIMESTAMP,
          confidence: normalizeNumber(raw.matchScore, 0.5, 0, 1),
        };
        return {
          id,
          provider:
            normalizeString(raw.provider, provenance.provider) ||
            provenance.provider,
          sourceUrl: normalizeString(raw.sourceUrl) || undefined,
          torrentHash: normalizeString(raw.torrentHash) || undefined,
          fileIndex:
            raw.fileIndex == null
              ? undefined
              : normalizeNumber(raw.fileIndex, index, 0, 100000, true),
          fileName,
          storagePath,
          contentKind,
          contentType:
            normalizeString(raw.contentType, 'application/octet-stream') ||
            'application/octet-stream',
          accessBasis:
            raw.accessBasis === 'public_domain' ||
            raw.accessBasis === 'open_access' ||
            raw.accessBasis === 'user_owned' ||
            raw.accessBasis === 'user_provided'
              ? raw.accessBasis
              : 'user_provided',
          sha256: normalizeString(raw.sha256) || undefined,
          status: normalizeDocumentStatus(raw.status, contentKind),
          matchScore: normalizeNumber(
            raw.matchScore,
            provenance.confidence,
            0,
            1,
          ),
          availability: normalizeDocumentAvailability(raw.availability),
          provenance,
          createdAt: normalizeString(raw.createdAt) || provenance.fetchedAt,
          updatedAt: normalizeString(raw.updatedAt) || provenance.fetchedAt,
        };
      }),
    ),
  );
}
