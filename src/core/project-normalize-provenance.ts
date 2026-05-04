import type { EnrichmentFieldProvenance } from './types';
import { safeNumber } from './utils';
import {
  normalizeBoolean,
  normalizeString,
  normalizeStringArray,
} from './project-normalize-primitives';

export function normalizeProvenance(value: unknown): EnrichmentFieldProvenance | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const provider = normalizeString(raw.provider);
  if (!provider) {
    return undefined;
  }
  return {
    provider,
    sourceUrl: normalizeString(raw.sourceUrl) || undefined,
    fetchedAt: normalizeString(raw.fetchedAt) || new Date(0).toISOString(),
    confidence: safeNumber(raw.confidence, 0),
    strategy: normalizeString(raw.strategy) || undefined,
    inferred: normalizeBoolean(raw.inferred),
    evidenceAnchors: normalizeStringArray(raw.evidenceAnchors).slice(0, 12),
  };
}
