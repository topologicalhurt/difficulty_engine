import type {
  BookDocumentAvailability,
  BookDocumentAcquisitionState,
  BookDocumentRef,
  BookRecord,
} from '../core/types';
import type { PageAnchorEvidence } from './toc-page-ranges';
import {
  DEFAULT_CONTENT_PREFERENCE,
  DEFAULT_DOCUMENT_DATA_ROOT,
} from '../core/default-source-settings';
import type { SourceContentKind, SourceSettings } from '../core/types';
import { contentKindPriorityForPreference } from './document-content-priority';
import {
  compareDocumentCandidateQuality,
  documentCandidateQualityScore,
} from './document-candidate-quality';
import {
  documentGreylistKey,
  mergeDocumentCandidateQueue,
} from '../core/document-acquisition-state';

export type DocumentAccessBasis =
  | 'public_domain'
  | 'open_access'
  | 'user_owned'
  | 'user_provided';

export type DocumentContentKind = SourceContentKind | 'unknown';

export interface DocumentAcquisitionPolicy {
  enabled: boolean;
  allowedAccess: DocumentAccessBasis[];
  dataRoot: string;
  contentPreference: SourceContentKind[];
  sourceSettings?: SourceSettings;
}

export interface DocumentCandidate {
  id: string;
  provider: string;
  title: string;
  sourceUrl: string;
  contentKind: DocumentContentKind;
  accessBasis?: DocumentAccessBasis;
  confidence: number;
  sizeBytes?: number;
  seeders?: number | null;
  peers?: number | null;
  matchScore?: number;
  qualityScore?: number;
  qualityReason?: string;
  greylistKey?: string;
  greylistPenalty?: number;
  greylistReason?: string;
  rank?: number;
  retryable?: boolean;
  queuedAt?: string;
  lastSeenAt?: string;
  availability?: BookDocumentAvailability;
}

export interface AcquiredDocument {
  candidateId: string;
  provider: string;
  sourceUrl?: string;
  storagePath?: string;
  contentType: string;
  accessBasis: DocumentAccessBasis;
  confidence: number;
  text?: string;
  bytes?: Uint8Array;
  pageAnchors?: PageAnchorEvidence[];
  sha256?: string;
  documentRef?: BookDocumentRef;
  acquiredAt: string;
}

export interface DocumentAcquisitionRequest {
  book: BookRecord;
  policy: DocumentAcquisitionPolicy;
  signal?: AbortSignal;
}

export interface DocumentAcquisitionProvider {
  readonly id: string;
  readonly enabled: boolean;
  findCandidates(
    request: DocumentAcquisitionRequest,
  ): Promise<DocumentCandidate[]>;
  acquire(
    candidate: DocumentCandidate,
    request: DocumentAcquisitionRequest,
  ): Promise<AcquiredDocument | null>;
}

export interface DocumentStorageAdapter {
  writeDocument(
    book: BookRecord,
    document: Omit<AcquiredDocument, 'storagePath'>,
    dataRoot: string,
  ): Promise<AcquiredDocument>;
}

export function defaultDocumentAcquisitionPolicy(): DocumentAcquisitionPolicy {
  return {
    enabled: false,
    allowedAccess: [
      'public_domain',
      'open_access',
      'user_owned',
      'user_provided',
    ],
    dataRoot: DEFAULT_DOCUMENT_DATA_ROOT,
    contentPreference: [...DEFAULT_CONTENT_PREFERENCE],
  };
}

export function isLawfulDocumentCandidate(
  candidate: DocumentCandidate,
  policy: DocumentAcquisitionPolicy,
): boolean {
  return Boolean(
    policy.enabled &&
    candidate.accessBasis &&
    policy.allowedAccess.includes(candidate.accessBasis),
  );
}

export function candidateHasDownloadEvidence(
  candidate: Pick<
    DocumentCandidate,
    'provider' | 'accessBasis' | 'seeders' | 'availability'
  >,
): boolean {
  if (candidate.provider !== 'qbittorrent') return true;
  if (candidate.accessBasis === 'user_provided') return true;
  const availability = candidate.availability;
  return Boolean(
    (candidate.seeders ?? availability?.seeders ?? 0) > 0 ||
      (availability?.availability ?? 0) > 0 ||
      (availability?.downloadSpeedBytesPerSecond ?? 0) > 0 ||
      (availability?.progress ?? 0) >= 1,
  );
}

export function choosePreferredDocumentCandidate(
  candidates: DocumentCandidate[],
  policy: DocumentAcquisitionPolicy,
  acquisitionState?: BookDocumentAcquisitionState,
): DocumentCandidate | null {
  return (
    rankDocumentCandidates(candidates, policy, acquisitionState)[0] ?? null
  );
}

export function rankDocumentCandidates(
  candidates: DocumentCandidate[],
  policy: DocumentAcquisitionPolicy,
  acquisitionState?: BookDocumentAcquisitionState,
): DocumentCandidate[] {
  const priorityFor = contentKindPriorityForPreference(
    policy.contentPreference,
  );
  const queueState = acquisitionState
    ? mergeDocumentCandidateQueue(acquisitionState, candidates)
    : undefined;
  const penaltyByKey = new Map(
    queueState?.candidateQueue.map((candidate) => [
      documentGreylistKey(candidate),
      candidate,
    ]) ?? [],
  );
  return [...candidates]
    .filter(
      (candidate) =>
        isLawfulDocumentCandidate(candidate, policy) &&
        candidateHasDownloadEvidence(candidate),
    )
    .map((candidate) => {
      const queued = penaltyByKey.get(documentGreylistKey(candidate));
      return queued
        ? {
            ...candidate,
            greylistKey: queued.greylistKey,
            greylistPenalty: queued.greylistPenalty,
            greylistReason: queued.greylistReason,
            qualityScore: Math.max(
              0,
              documentCandidateQualityScore(
                { ...candidate, greylistPenalty: 0 },
                priorityFor,
              ) - (queued.greylistPenalty ?? 0),
            ),
          }
        : candidate;
    })
    .sort((left, right) =>
      compareDocumentCandidateQuality(left, right, priorityFor),
    );
}

export function mergeDocumentRefs(
  existing: BookDocumentRef[] = [],
  incoming: BookDocumentRef[] = [],
): BookDocumentRef[] {
  const byKey = new Map<string, BookDocumentRef>();
  [...existing, ...incoming].forEach((document) => {
    const key = documentMergeKey(document);
    const previous = byKey.get(key);
    byKey.set(key, previous ? mergeDocumentRef(previous, document) : document);
  });
  return canonicalizeBookDocumentRefs([...byKey.values()]).sort(
    (left, right) =>
      left.fileName.localeCompare(right.fileName) ||
      left.id.localeCompare(right.id),
  );
}

export function canonicalizeBookDocumentRefs(
  documents: BookDocumentRef[] = [],
): BookDocumentRef[] {
  const qbitDocuments = documents.filter(
    (document) => document.provider === 'qbittorrent',
  );
  const otherDocuments = documents.filter(
    (document) => document.provider !== 'qbittorrent',
  );
  if (qbitDocuments.length <= 1) return [...documents];
  const [preferred] = [...qbitDocuments].sort(compareDocumentRefPreference);
  return preferred ? [...otherDocuments, preferred] : otherDocuments;
}

function normalizedDocumentPath(value: string | undefined): string {
  return String(value ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .toLowerCase();
}

function documentMergeKey(document: BookDocumentRef): string {
  const torrentHash =
    document.torrentHash || document.sourceUrl?.match(/btih:([a-z0-9]+)/i)?.[1];
  if (torrentHash) {
    return `torrent:${torrentHash.toLowerCase()}:${document.fileIndex ?? normalizedDocumentPath(document.storagePath)}`;
  }
  const path = normalizedDocumentPath(document.storagePath);
  if (path) return `path:${path}`;
  if (document.sourceUrl) return `source:${document.sourceUrl}`;
  return `id:${document.id}`;
}

function mergeDocumentRef(
  previous: BookDocumentRef,
  incoming: BookDocumentRef,
): BookDocumentRef {
  const preferred =
    incoming.updatedAt >= previous.updatedAt
      ? incoming
      : compareDocumentRefPreference(previous, incoming) <= 0
        ? previous
        : incoming;
  return {
    ...previous,
    ...incoming,
    id: preferred.id,
    fileName: preferred.fileName,
    storagePath: preferred.storagePath,
    contentKind: preferred.contentKind,
    contentType: preferred.contentType,
    status: preferred.status,
    matchScore: Math.max(previous.matchScore, incoming.matchScore),
    createdAt: previous.createdAt || incoming.createdAt,
    updatedAt:
      previous.updatedAt > incoming.updatedAt
        ? previous.updatedAt
        : incoming.updatedAt,
    availability: {
      ...previous.availability,
      ...incoming.availability,
      progress: Math.max(
        previous.availability.progress ?? 0,
        incoming.availability.progress ?? 0,
      ),
      seeders: Math.max(
        previous.availability.seeders ?? 0,
        incoming.availability.seeders ?? 0,
      ),
      peers: Math.max(
        previous.availability.peers ?? 0,
        incoming.availability.peers ?? 0,
      ),
    },
  };
}

function documentStatusPriority(status: BookDocumentRef['status']): number {
  if (status === 'complete') return 0;
  if (status === 'downloading') return 1;
  if (status === 'queued') return 2;
  if (status === 'stalled') return 3;
  if (status === 'unreadable') return 4;
  return 5;
}

function compareDocumentRefPreference(
  left: BookDocumentRef,
  right: BookDocumentRef,
): number {
  return (
    documentStatusPriority(left.status) -
      documentStatusPriority(right.status) ||
    (right.availability.progress ?? 0) - (left.availability.progress ?? 0) ||
    right.matchScore - left.matchScore ||
    right.updatedAt.localeCompare(left.updatedAt) ||
    left.id.localeCompare(right.id)
  );
}

export function chooseSelectedDocumentId(
  documents: BookDocumentRef[],
  existingSelectedId: string | null | undefined,
  contentPreference: SourceContentKind[] = DEFAULT_CONTENT_PREFERENCE,
): string | undefined {
  if (
    existingSelectedId &&
    documents.some((document) => document.id === existingSelectedId)
  ) {
    return existingSelectedId;
  }
  const priorityFor = contentKindPriorityForPreference(contentPreference);
  return [...documents].sort(
    (left, right) =>
      documentStatusPriority(left.status) -
        documentStatusPriority(right.status) ||
      compareDocumentCandidateQuality(
        {
          id: left.id,
          title: left.fileName,
          contentKind: left.contentKind,
          accessBasis: left.accessBasis,
          confidence: left.provenance.confidence,
          matchScore: left.matchScore,
          seeders: left.availability.seeders,
        },
        {
          id: right.id,
          title: right.fileName,
          contentKind: right.contentKind,
          accessBasis: right.accessBasis,
          confidence: right.provenance.confidence,
          matchScore: right.matchScore,
          seeders: right.availability.seeders,
        },
        priorityFor,
      ),
  )[0]?.id;
}

export function disabledDocumentAcquisitionProvider(): DocumentAcquisitionProvider {
  return {
    id: 'disabled',
    enabled: false,
    async findCandidates(): Promise<DocumentCandidate[]> {
      return [];
    },
    async acquire(): Promise<AcquiredDocument | null> {
      return null;
    },
  };
}
