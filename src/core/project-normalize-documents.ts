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
    reason: normalizeString(raw.reason) || undefined,
  };
}

export function normalizeBookDocuments(input: unknown): BookDocumentRef[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  return compactItems(
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
  );
}
