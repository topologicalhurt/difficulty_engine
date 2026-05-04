import type { BookDocumentAvailability, BookDocumentRef, BookRecord } from '../core/types';
import type { SourceContentKind, SourceSettings } from '../core/types';
import { compareDocumentCandidateQuality } from './qbittorrent-selection';

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
  findCandidates(request: DocumentAcquisitionRequest): Promise<DocumentCandidate[]>;
  acquire(candidate: DocumentCandidate, request: DocumentAcquisitionRequest): Promise<AcquiredDocument | null>;
}

export interface DocumentStorageAdapter {
  writeDocument(
    book: BookRecord,
    document: Omit<AcquiredDocument, 'storagePath'>,
    dataRoot: string,
  ): Promise<AcquiredDocument>;
}

const CONTENT_KIND_PRIORITY: Record<DocumentContentKind, number> = {
  text: 0,
  epub: 1,
  ocr_text: 2,
  pdf: 3,
  unknown: 4,
};

export function defaultDocumentAcquisitionPolicy(): DocumentAcquisitionPolicy {
  return {
    enabled: false,
    allowedAccess: ['public_domain', 'open_access', 'user_owned', 'user_provided'],
    dataRoot: 'data/documents',
    contentPreference: ['text', 'epub', 'ocr_text', 'pdf'],
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

export function choosePreferredDocumentCandidate(
  candidates: DocumentCandidate[],
  policy: DocumentAcquisitionPolicy,
): DocumentCandidate | null {
  const orderedKinds = [...policy.contentPreference, 'unknown'];
  const priorityFor = (kind: DocumentContentKind): number => {
    const index = orderedKinds.indexOf(kind);
    return index >= 0 ? index : CONTENT_KIND_PRIORITY[kind];
  };
  return [...candidates]
    .filter((candidate) => isLawfulDocumentCandidate(candidate, policy))
    .sort((left, right) => compareDocumentCandidateQuality(left, right, priorityFor))[0] ?? null;
}

export function mergeDocumentRefs(
  existing: BookDocumentRef[] = [],
  incoming: BookDocumentRef[] = [],
): BookDocumentRef[] {
  const byId = new Map<string, BookDocumentRef>();
  existing.forEach((document) => byId.set(document.id, document));
  incoming.forEach((document) => {
    const previous = byId.get(document.id);
    byId.set(document.id, {
      ...(previous ?? document),
      ...document,
      createdAt: previous?.createdAt ?? document.createdAt,
      availability: {
        ...(previous?.availability ?? document.availability),
        ...document.availability,
      },
    });
  });
  return [...byId.values()].sort((left, right) =>
    left.fileName.localeCompare(right.fileName) || left.id.localeCompare(right.id),
  );
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
