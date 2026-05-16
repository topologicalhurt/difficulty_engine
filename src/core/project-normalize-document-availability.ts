import { candidateHasLiveAvailability } from './document-candidate-availability';
import {
  normalizeNumber,
  normalizeString,
} from './project-normalize-primitives';
import type {
  BookDocumentAvailability,
  BookDocumentSearchAvailability,
} from './types';

export function normalizeDocumentAvailability(
  value: unknown,
): BookDocumentAvailability {
  const raw =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  const nullableCount = (input: unknown): number | null =>
    input == null || input === ''
      ? null
      : Math.max(0, Math.round(Number(input) || 0));
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

export function normalizeSearchAvailability(
  value: unknown,
): BookDocumentSearchAvailability | undefined {
  const raw =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  const seeders =
    raw.seeders == null
      ? null
      : normalizeNumber(raw.seeders, 0, 0, 100000, true);
  const peers =
    raw.peers == null ? null : normalizeNumber(raw.peers, 0, 0, 100000, true);
  if (
    seeders == null &&
    peers == null &&
    !normalizeString(raw.observedAt) &&
    !normalizeString(raw.plugin) &&
    !normalizeString(raw.pattern)
  ) {
    return undefined;
  }
  return {
    seeders,
    peers,
    observedAt: normalizeString(raw.observedAt) || undefined,
    plugin: normalizeString(raw.plugin) || undefined,
    pattern: normalizeString(raw.pattern) || undefined,
  };
}

export function legacySearchAvailability(
  raw: Record<string, unknown>,
  availability: BookDocumentAvailability,
): BookDocumentSearchAvailability | undefined {
  const seeders =
    raw.seeders == null
      ? null
      : normalizeNumber(raw.seeders, 0, 0, 100000, true);
  const peers =
    raw.peers == null ? null : normalizeNumber(raw.peers, 0, 0, 100000, true);
  const source =
    raw.availabilitySource === 'live_qbit' ||
    raw.availabilitySource === 'search_result'
      ? raw.availabilitySource
      : undefined;
  if (
    candidateHasLiveAvailability({
      seeders,
      peers,
      availability,
      availabilitySource: source,
    })
  ) {
    return undefined;
  }
  return seeders == null && peers == null ? undefined : { seeders, peers };
}
