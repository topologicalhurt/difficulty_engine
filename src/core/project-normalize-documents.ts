import { normalizeProvenance } from './project-normalize-provenance';
import type {
  BookDocumentAvailability,
  BookDocumentRef,
  BookDocumentStatus,
  SourceContentKind,
} from './types';
import { compactItems, safeNumber } from './utils';
import {
  normalizeNumber,
  normalizeString,
} from './project-normalize-primitives';
import { EPOCH_ISO_TIMESTAMP } from './time';

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
      raw.availability == null
        ? null
        : normalizeNumber(raw.availability, 0, 0),
    sizeBytes:
      raw.sizeBytes == null
        ? null
        : normalizeNumber(raw.sizeBytes, 0, 0),
    qualityScore:
      raw.qualityScore == null
        ? undefined
        : normalizeNumber(raw.qualityScore, 0, 0, 1),
    reason: normalizeString(raw.reason) || undefined,
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
  const others = documents.filter(
    (doc) => doc.provider !== 'qbittorrent',
  );
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
