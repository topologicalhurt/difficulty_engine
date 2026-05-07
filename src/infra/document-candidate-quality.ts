import type { DocumentCandidate } from './document-acquisition';

export const EXACT_DOCUMENT_MATCH_SCORE = 0.92;
export const SIGNIFICANT_DOCUMENT_MATCH_SCORE_DELTA = 0.15;
export const DOCUMENT_SEEDER_SCORE_CAP = 120;
const DOCUMENT_SPEED_SCORE_CAP_BYTES_PER_SECOND = 2 * 1024 * 1024;
const DOCUMENT_REASONABLE_ETA_SECONDS = 60 * 60;

function bounded(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function availabilityQuality(
  candidate: Pick<
    DocumentCandidate,
    'seeders' | 'availability' | 'sizeBytes'
  >,
): number {
  const availability = candidate.availability;
  const seeders =
    candidate.seeders ??
    availability?.seeders ??
    (availability?.progress === 1 ? 1 : null);
  const seederScore =
    seeders == null
      ? 0.35
      : Math.min(
          1,
          Math.log1p(Math.max(0, seeders)) /
            Math.log1p(DOCUMENT_SEEDER_SCORE_CAP),
        );
  const liveAvailability =
    availability?.availability == null
      ? null
      : bounded(availability.availability);
  const speed =
    availability?.downloadSpeedBytesPerSecond == null
      ? null
      : Math.max(0, availability.downloadSpeedBytesPerSecond);
  const speedScore =
    speed == null
      ? null
      : bounded(speed / DOCUMENT_SPEED_SCORE_CAP_BYTES_PER_SECOND);
  const eta = availability?.etaSeconds;
  const etaScore =
    eta == null || eta < 0 || !Number.isFinite(eta)
      ? null
      : bounded(1 - eta / DOCUMENT_REASONABLE_ETA_SECONDS);
  const progressScore = bounded(availability?.progress ?? 0);
  const knownScores = [
    liveAvailability,
    speedScore,
    etaScore,
    progressScore ? progressScore * 0.7 : null,
  ].filter((score): score is number => score != null);
  const liveScore = knownScores.length
    ? knownScores.reduce((sum, score) => sum + score, 0) / knownScores.length
    : 0.35;
  return seederScore * 0.55 + liveScore * 0.45;
}

export function documentCandidateQualityScore(
  candidate: Pick<
    DocumentCandidate,
    'matchScore' | 'seeders' | 'confidence' | 'contentKind' | 'accessBasis'
    | 'availability'
    | 'sizeBytes'
    | 'greylistPenalty'
  >,
  contentKindPriority: (kind: DocumentCandidate['contentKind']) => number,
): number {
  const hasMatchEvidence = candidate.matchScore != null;
  const matchScore = candidate.matchScore ?? 0.5;
  const seeders =
    candidate.seeders ??
    candidate.availability?.seeders ??
    (candidate.availability?.progress === 1 ? 1 : null);
  const liveQualityScore = availabilityQuality(candidate);
  const contentScore = Math.max(
    0,
    1 - contentKindPriority(candidate.contentKind) / 4,
  );
  const provenanceScore =
    candidate.accessBasis === 'public_domain' ||
    candidate.accessBasis === 'open_access'
      ? 1
      : candidate.accessBasis === 'user_owned'
        ? 0.95
        : candidate.accessBasis === 'user_provided'
          ? 0.85
          : 0.25;
  if (!hasMatchEvidence) {
    return (
      contentScore * 0.6 + provenanceScore * 0.2 + candidate.confidence * 0.2
    );
  }
  const exactBoost = matchScore >= EXACT_DOCUMENT_MATCH_SCORE ? 0.08 : 0;
  const noAvailability =
    seeders === 0 &&
    (candidate.availability?.availability ?? 0) <= 0 &&
    (candidate.availability?.progress ?? 0) < 1;
  const deadPenalty = noAvailability ? 0.55 : seeders === 0 ? 0.35 : 0;
  return Math.max(
    0,
    matchScore * 0.44 +
      liveQualityScore * 0.3 +
      provenanceScore * 0.13 +
      contentScore * 0.09 +
      candidate.confidence * 0.04 +
      exactBoost -
      deadPenalty -
      (candidate.greylistPenalty ?? 0),
  );
}

export function compareDocumentCandidateQuality(
  left: Pick<
    DocumentCandidate,
    | 'matchScore'
    | 'seeders'
    | 'confidence'
    | 'contentKind'
    | 'title'
    | 'id'
    | 'accessBasis'
    | 'availability'
    | 'sizeBytes'
    | 'greylistPenalty'
  >,
  right: Pick<
    DocumentCandidate,
    | 'matchScore'
    | 'seeders'
    | 'confidence'
    | 'contentKind'
    | 'title'
    | 'id'
    | 'accessBasis'
    | 'availability'
    | 'sizeBytes'
    | 'greylistPenalty'
  >,
  contentKindPriority: (kind: DocumentCandidate['contentKind']) => number,
): number {
  const leftMatch = left.matchScore ?? 0;
  const rightMatch = right.matchScore ?? 0;
  const scoreDelta =
    documentCandidateQualityScore(right, contentKindPriority) -
    documentCandidateQualityScore(left, contentKindPriority);
  if (Math.abs(scoreDelta) > 0.0001) return scoreDelta;
  const exactDelta =
    Number(rightMatch >= EXACT_DOCUMENT_MATCH_SCORE) -
    Number(leftMatch >= EXACT_DOCUMENT_MATCH_SCORE);
  if (exactDelta !== 0) return exactDelta;
  if (left.matchScore != null || right.matchScore != null) {
    const matchDelta = rightMatch - leftMatch;
    if (Math.abs(matchDelta) > SIGNIFICANT_DOCUMENT_MATCH_SCORE_DELTA) {
      return matchDelta;
    }
  }
  const seederDelta =
    (right.seeders ?? right.availability?.seeders ?? 0) -
    (left.seeders ?? left.availability?.seeders ?? 0);
  if (seederDelta !== 0) return seederDelta;
  const kindDelta =
    contentKindPriority(left.contentKind) -
    contentKindPriority(right.contentKind);
  if (kindDelta !== 0) return kindDelta;
  const confidenceDelta = right.confidence - left.confidence;
  if (confidenceDelta !== 0) return confidenceDelta;
  return (
    left.title.localeCompare(right.title) || left.id.localeCompare(right.id)
  );
}
