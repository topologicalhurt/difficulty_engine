import type {
  DocumentAcquisitionRequest,
  DocumentCandidate,
} from './document-acquisition';
import { contentKindFromUrl } from './qbittorrent-file-kinds';
import type { TorrentFile, TorrentInfo } from './qbittorrent-types';
import { contentKindPriorityForPreference } from './document-content-priority';
import { bookMatchDecision, normalizedIsbnText } from '../core/matchers';

export const MIN_PLUGIN_SEEDERS = 1;
export const MIN_TORRENT_MATCH_SCORE = 0.34;
export const MIN_SELECTED_FILE_MATCH_SCORE = 0.34;
export const EXACT_TORRENT_MATCH_SCORE = 0.92;
export const SIGNIFICANT_MATCH_SCORE_DELTA = 0.15;
export const TORRENT_SEEDER_SCORE_CAP = 120;
export const BAD_FILE_NAME_PATTERN =
  /\b(?:sample|preview|solution|solutions|answer|answers|instructor|slides|cover|front\s*matter|copyright)\b/i;

export function normalizedBookIsbn(value: string | null | undefined): string {
  return normalizedIsbnText(value);
}

export function bookMatchScore(
  title: string,
  request: DocumentAcquisitionRequest,
): number {
  const book = request.book;
  return bookMatchDecision({
    target: {
      title: book.title,
      short: book.short,
      authors: book.authors,
      isbn: book.isbn,
    },
    candidate: { title },
    sourceMode: 'external_search',
  }).score;
}

export function fileMatchScore(
  file: TorrentFile,
  request: DocumentAcquisitionRequest,
): number {
  const name = file.name ?? '';
  if (BAD_FILE_NAME_PATTERN.test(name)) return 0;
  return bookMatchScore(name, request);
}

export function hashFromMagnet(value: string): string {
  const match = value.match(/btih:([a-z0-9]+)/i);
  return match?.[1]?.toLowerCase() ?? '';
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
    Number(rightMatch >= EXACT_TORRENT_MATCH_SCORE) -
    Number(leftMatch >= EXACT_TORRENT_MATCH_SCORE);
  if (exactDelta !== 0) return exactDelta;
  if (left.matchScore != null || right.matchScore != null) {
    const matchDelta = rightMatch - leftMatch;
    if (Math.abs(matchDelta) > SIGNIFICANT_MATCH_SCORE_DELTA) return matchDelta;
  }
  const seederDelta = (right.seeders ?? 0) - (left.seeders ?? 0);
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

export function documentCandidateQualityScore(
  candidate: Pick<
    DocumentCandidate,
    'matchScore' | 'seeders' | 'confidence' | 'contentKind' | 'accessBasis'
  >,
  contentKindPriority: (kind: DocumentCandidate['contentKind']) => number,
): number {
  const hasMatchEvidence = candidate.matchScore != null;
  const matchScore = candidate.matchScore ?? 0.5;
  const seeders =
    candidate.seeders == null ? null : Math.max(0, candidate.seeders);
  const seederScore =
    seeders == null
      ? 0.35
      : Math.min(1, Math.log1p(seeders) / Math.log1p(TORRENT_SEEDER_SCORE_CAP));
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
  const exactBoost = matchScore >= EXACT_TORRENT_MATCH_SCORE ? 0.08 : 0;
  const deadPenalty = seeders === 0 ? 0.4 : 0;
  return (
    matchScore * 0.44 +
    seederScore * 0.3 +
    provenanceScore * 0.13 +
    contentScore * 0.09 +
    candidate.confidence * 0.04 +
    exactBoost -
    deadPenalty
  );
}

export function preferredTorrentFile(
  files: TorrentFile[],
  request: DocumentAcquisitionRequest,
): TorrentFile | null {
  const priorityFor = contentKindPriorityForPreference(
    request.policy.contentPreference,
  );
  return (
    [...files]
      .filter(
        (file) =>
          file.index != null &&
          contentKindFromUrl(file.name ?? '') !== 'unknown',
      )
      .filter((file) => !BAD_FILE_NAME_PATTERN.test(file.name ?? ''))
      .sort((left, right) => {
        const matchDelta =
          fileMatchScore(right, request) - fileMatchScore(left, request);
        if (Math.abs(matchDelta) > SIGNIFICANT_MATCH_SCORE_DELTA) {
          return matchDelta;
        }
        const kindDelta =
          priorityFor(contentKindFromUrl(left.name ?? '')) -
          priorityFor(contentKindFromUrl(right.name ?? ''));
        if (kindDelta !== 0) return kindDelta;
        if (matchDelta !== 0) return matchDelta;
        const progressDelta = (right.progress ?? 0) - (left.progress ?? 0);
        if (progressDelta !== 0) return progressDelta;
        return String(left.name ?? '').localeCompare(String(right.name ?? ''));
      })[0] ?? null
  );
}

export function selectedTorrentFileIsTrusted(
  file: TorrentFile,
  candidate: DocumentCandidate,
  request: DocumentAcquisitionRequest,
): boolean {
  const fileScore = fileMatchScore(file, request);
  return Boolean(
    fileScore >= MIN_SELECTED_FILE_MATCH_SCORE &&
    (candidate.matchScore ?? 0) >= MIN_TORRENT_MATCH_SCORE,
  );
}

export function torrentComplete(
  info: TorrentInfo | null,
  selected?: TorrentFile | null,
): boolean {
  if (selected?.progress != null) return selected.progress >= 1;
  if (info?.progress != null) return info.progress >= 1;
  return (
    info?.amount_left === 0 ||
    /upload|stalledUP|queuedUP|forcedUP/i.test(info?.state ?? '')
  );
}

export function documentStatus(
  info: TorrentInfo | null,
  selected?: TorrentFile | null,
): 'downloading' | 'complete' | 'stalled' {
  if (torrentComplete(info, selected)) return 'complete';
  if (/stalledDL|error|missingFiles/i.test(info?.state ?? '')) return 'stalled';
  return 'downloading';
}

export function documentRefId(
  hash: string | undefined,
  fileIndex: number | undefined,
  storagePath: string,
): string {
  return `qbittorrent:${hash || storagePath}:${fileIndex ?? 'file'}`;
}
