import type { TorrentFile } from './qbittorrent-types';
import { contentKindFromUrl } from './qbittorrent-file-kinds';

export const BAD_QBITTORRENT_FILE_NAME_PATTERN =
  /\b(?:sample|preview|solution|solutions|solver|solvers|answer|answers|instructor|slides|cover|front\s*matter|copyright)\b/i;

const SYSTEM_PATH_SEGMENT_PATTERN = /^(?:__macosx|\.ds_store)$/i;
const MAX_SURFACE_PDF_DEPTH = 2;

export interface QbittorrentPdfEligibility {
  eligible: boolean;
  reasons: string[];
  depth: number;
}

export function torrentFilePathSegments(fileName: string | null | undefined): string[] {
  return String(fileName ?? '')
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export function qbittorrentPdfEligibility(
  file: TorrentFile,
): QbittorrentPdfEligibility {
  const name = file.name ?? '';
  const segments = torrentFilePathSegments(name);
  const reasons = [
    file.index == null ? 'missing file index' : '',
    contentKindFromUrl(name) !== 'pdf' ? 'not a PDF' : '',
    segments.length === 0 ? 'missing file name' : '',
    segments.length > MAX_SURFACE_PDF_DEPTH
      ? 'PDF is nested below the first folder level'
      : '',
    segments.some((segment) => SYSTEM_PATH_SEGMENT_PATTERN.test(segment))
      ? 'system metadata path'
      : '',
    BAD_QBITTORRENT_FILE_NAME_PATTERN.test(name)
      ? 'sample/solution/auxiliary PDF'
      : '',
  ].filter(Boolean);
  return {
    eligible: reasons.length === 0,
    reasons,
    depth: segments.length,
  };
}

export function qbittorrentPdfRejectionSummary(files: TorrentFile[]): string {
  if (!files.length) {
    return 'Torrent metadata is not available yet; refresh after qBittorrent exposes the file list.';
  }
  const reasons = new Map<string, number>();
  files.forEach((file) => {
    qbittorrentPdfEligibility(file).reasons.forEach((reason) => {
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    });
  });
  if (!reasons.size) {
    return 'No PDF file passed the title, author, or ISBN trust checks.';
  }
  return [...reasons.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([reason, count]) => `${reason} (${count})`)
    .join('; ');
}
