import type {
  DocumentAcquisitionRequest,
  DocumentCandidate,
} from './document-acquisition';
import { contentKindFromUrl } from './qbittorrent-file-kinds';
import type { TorrentFile, TorrentInfo } from './qbittorrent-types';
import { contentKindPriorityForPreference } from './document-content-priority';
import { bookMatchDecision, normalizedIsbnText } from '../core/matchers';
import { SIGNIFICANT_DOCUMENT_MATCH_SCORE_DELTA } from './document-candidate-quality';

export const MIN_PLUGIN_SEEDERS = 1;
export const MIN_TORRENT_MATCH_SCORE = 0.34;
export const MIN_SELECTED_FILE_MATCH_SCORE = 0.34;
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

export function preferredTorrentFile(
  files: TorrentFile[],
  request: DocumentAcquisitionRequest,
): TorrentFile | null {
  return rankedTorrentFiles(files, request)[0] ?? null;
}

export function rankedTorrentFiles(
  files: TorrentFile[],
  request: DocumentAcquisitionRequest,
): TorrentFile[] {
  const priorityFor = contentKindPriorityForPreference(
    request.policy.contentPreference,
  );
  return [...files]
    .filter(
      (file) =>
        file.index != null &&
        contentKindFromUrl(file.name ?? '') !== 'unknown',
    )
    .filter((file) => !BAD_FILE_NAME_PATTERN.test(file.name ?? ''))
    .sort((left, right) => {
      const matchDelta =
        fileMatchScore(right, request) - fileMatchScore(left, request);
      if (Math.abs(matchDelta) > SIGNIFICANT_DOCUMENT_MATCH_SCORE_DELTA) {
        return matchDelta;
      }
      const kindDelta =
        priorityFor(contentKindFromUrl(left.name ?? '')) -
        priorityFor(contentKindFromUrl(right.name ?? ''));
      if (kindDelta !== 0) return kindDelta;
      if (matchDelta !== 0) return matchDelta;
      const availabilityDelta =
        (right.availability ?? 0) - (left.availability ?? 0);
      if (availabilityDelta !== 0) return availabilityDelta;
      const progressDelta = (right.progress ?? 0) - (left.progress ?? 0);
      if (progressDelta !== 0) return progressDelta;
      return String(left.name ?? '').localeCompare(String(right.name ?? ''));
    });
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

export function torrentAvailability(info: TorrentInfo | null): {
  seeders: number | null;
  peers: number | null;
  progress: number;
  state: string;
  etaSeconds?: number | null;
  downloadSpeedBytesPerSecond?: number | null;
  availability?: number | null;
  sizeBytes?: number | null;
} {
  const seeders = info?.num_seeds == null ? null : Math.max(0, info.num_seeds);
  const peers = info?.num_leechs == null ? null : Math.max(0, info.num_leechs);
  return {
    seeders,
    peers,
    progress: info?.progress ?? 0,
    state: info?.state ?? (info ? 'tracked' : 'unknown'),
    etaSeconds:
      info?.eta == null || info.eta < 0 || !Number.isFinite(info.eta)
        ? null
        : info.eta,
    downloadSpeedBytesPerSecond:
      info?.dlspeed == null ? null : Math.max(0, info.dlspeed),
    availability:
      info?.availability == null ? null : Math.max(0, info.availability),
    sizeBytes: info?.size ?? info?.total_size ?? null,
  };
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
