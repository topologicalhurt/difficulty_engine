import type { EnrichmentFieldProvenance } from './types';
import { safeNumber } from './utils';
import {
  normalizeBoolean,
  normalizeString,
  normalizeStringArray,
} from './project-normalize-primitives';
import { EPOCH_ISO_TIMESTAMP } from './time';

export function normalizeProvenance(
  value: unknown,
): EnrichmentFieldProvenance | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const provider = normalizeString(raw.provider);
  if (!provider) {
    return undefined;
  }
  const rawPageRange =
    raw.pageRange && typeof raw.pageRange === 'object'
      ? (raw.pageRange as Record<string, unknown>)
      : null;
  const pageStart = rawPageRange
    ? Math.max(1, Math.round(safeNumber(rawPageRange.start, Number.NaN)))
    : Number.NaN;
  const pageEnd = rawPageRange
    ? Math.max(pageStart, Math.round(safeNumber(rawPageRange.end, Number.NaN)))
    : Number.NaN;
  return {
    provider,
    sourceUrl: normalizeString(raw.sourceUrl) || undefined,
    fetchedAt: normalizeString(raw.fetchedAt) || EPOCH_ISO_TIMESTAMP,
    confidence: safeNumber(raw.confidence, 0),
    strategy: normalizeString(raw.strategy) || undefined,
    inferred: normalizeBoolean(raw.inferred),
    evidenceAnchors: normalizeStringArray(raw.evidenceAnchors).slice(0, 12),
    pageRange:
      Number.isFinite(pageStart) && Number.isFinite(pageEnd)
        ? { start: pageStart, end: pageEnd }
        : undefined,
  };
}
