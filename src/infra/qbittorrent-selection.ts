import type {
  DocumentAcquisitionRequest,
  DocumentCandidate,
} from './document-acquisition';
import type { TorrentFile, TorrentInfo } from './qbittorrent-types';
import {
  authorAppearsInText,
  bookMatchDecision,
  isbnAppearsInText,
  matchTokens,
  normalizeMatcherText,
  normalizedIsbnText,
} from '../core/matchers';
import { SIGNIFICANT_DOCUMENT_MATCH_SCORE_DELTA } from './document-candidate-quality';
import {
  BAD_QBITTORRENT_FILE_NAME_PATTERN,
  qbittorrentPdfEligibility,
  qbittorrentPdfRejectionSummary,
} from './qbittorrent-pdf-eligibility';

export const MIN_PLUGIN_SEEDERS = 1;
export const MIN_TORRENT_MATCH_SCORE = 0.34;
export const MIN_SELECTED_FILE_MATCH_SCORE = 0.34;
export const BAD_FILE_NAME_PATTERN = BAD_QBITTORRENT_FILE_NAME_PATTERN;

const GENERIC_QBITTORRENT_TITLE_TOKENS = new Set([
  'and',
  'approach',
  'book',
  'course',
  'edition',
  'ed',
  'everyone',
  'for',
  'from',
  'guide',
  'handbook',
  'introduction',
  'introductory',
  'lecture',
  'lectures',
  'manual',
  'practical',
  'second',
  'systems',
  'the',
  'theory',
  'third',
  'volume',
  'vol',
  'with',
]);
const QBITTORRENT_TITLE_NOISE_PATTERN =
  /\b(?:\d+(?:st|nd|rd|th)?|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|edition|ed|revised|updated|international|student)\b/g;
const QBITTORRENT_TITLE_TRAILING_DETAIL_PATTERN =
  /\s*(?::|\(|\s[-–—]\s).*$/;
const QBITTORRENT_TITLE_RESIDUAL_NOISE_PATTERN =
  /\b(?:pdf|ebook|e-book|retail|truepdf|scan|scanned|gnv64|lnw|z+|by)\b/g;

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
  if (!qbittorrentPdfEligibility(file).eligible) return 0;
  return bookMatchScore(name, request);
}

function qbittorrentEvidenceTokens(value: string): Set<string> {
  return new Set(matchTokens(normalizeMatcherText(value).replace(/[-']/g, ' ')));
}

function distinctiveBookTitleTokens(
  request: DocumentAcquisitionRequest,
): string[] {
  return matchTokens(
    normalizeMatcherText(request.book.title)
      .replace(/[-']/g, ' ')
      .replace(
        /\b(?:\d+(?:st|nd|rd|th)?|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|edition|ed)\b/g,
        ' ',
      ),
  ).filter((token) => !GENERIC_QBITTORRENT_TITLE_TOKENS.has(token));
}

export function hasRequiredQbittorrentTitleEvidence(
  evidence: string,
  request: DocumentAcquisitionRequest,
): boolean {
  if (isbnAppearsInText(request.book.isbn, evidence)) return true;
  const requiredTokens = distinctiveBookTitleTokens(request);
  if (!requiredTokens.length) return true;
  const candidateTokens = qbittorrentEvidenceTokens(evidence);
  const matched = requiredTokens.filter((token) => candidateTokens.has(token));
  if (requiredTokens.length <= 2) return matched.length === requiredTokens.length;
  const requiredCount =
    requiredTokens.length >= 5
      ? Math.ceil(requiredTokens.length * 0.6)
      : Math.ceil(requiredTokens.length * 0.75);
  return matched.length >= requiredCount;
}

function normalizedQbittorrentTitlePhrase(value: string): string {
  return normalizeMatcherText(value)
    .replace(QBITTORRENT_TITLE_NOISE_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function exactTitlePhrases(request: DocumentAcquisitionRequest): string[] {
  const rawTitles = [
    request.book.title,
    request.book.title.replace(QBITTORRENT_TITLE_TRAILING_DETAIL_PATTERN, ''),
    request.book.short,
    request.book.short.replace(QBITTORRENT_TITLE_TRAILING_DETAIL_PATTERN, ''),
  ];
  return [...new Set(rawTitles.map(normalizedQbittorrentTitlePhrase))]
    .filter(Boolean)
    .filter((phrase) => phrase.split(/\s+/).length >= 3)
    .filter((phrase) => matchTokens(phrase).length >= 2)
    .filter((phrase) => {
      const tokens = matchTokens(phrase);
      return tokens.some((token) => !GENERIC_QBITTORRENT_TITLE_TOKENS.has(token));
    });
}

export function hasExactQbittorrentTitlePhrase(
  evidence: string,
  request: DocumentAcquisitionRequest,
): boolean {
  const normalizedEvidence = ` ${normalizedQbittorrentTitlePhrase(evidence)} `;
  return exactTitlePhrases(request).some((phrase) => {
    if (!normalizedEvidence.includes(` ${phrase} `)) return false;
    const residual = normalizedEvidence
      .replace(` ${phrase} `, ' ')
      .replace(QBITTORRENT_TITLE_RESIDUAL_NOISE_PATTERN, ' ');
    const residualTokens = matchTokens(residual).filter(
      (token) =>
        !GENERIC_QBITTORRENT_TITLE_TOKENS.has(token) && !/\d/.test(token),
    );
    return residualTokens.length === 0;
  });
}

export function hasRequiredQbittorrentAuthorEvidence(
  evidence: string,
  request: DocumentAcquisitionRequest,
): boolean {
  if (!request.book.authors.length) return true;
  return (
    isbnAppearsInText(request.book.isbn, evidence) ||
    authorAppearsInText(request.book.authors, evidence) ||
    hasExactQbittorrentTitlePhrase(evidence, request)
  );
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
  return [...files]
    .filter((file) => qbittorrentPdfEligibility(file).eligible)
    .sort((left, right) => {
      const matchDelta =
        fileMatchScore(right, request) - fileMatchScore(left, request);
      if (Math.abs(matchDelta) > SIGNIFICANT_DOCUMENT_MATCH_SCORE_DELTA) {
        return matchDelta;
      }
      if (matchDelta !== 0) return matchDelta;
      const availabilityDelta =
        (right.availability ?? 0) - (left.availability ?? 0);
      if (availabilityDelta !== 0) return availabilityDelta;
      const progressDelta = (right.progress ?? 0) - (left.progress ?? 0);
      if (progressDelta !== 0) return progressDelta;
      return String(left.name ?? '').localeCompare(String(right.name ?? ''));
    });
}

export interface TrustedTorrentFileSelection {
  selected: TorrentFile | null;
  fileCount: number;
  eligibleFileCount: number;
  rejectionReason?: string;
}

export function selectTrustedTorrentFile(
  files: TorrentFile[],
  candidate: DocumentCandidate,
  request: DocumentAcquisitionRequest,
): TrustedTorrentFileSelection {
  const rankedFiles = rankedTorrentFiles(files, request);
  if (!rankedFiles.length) {
    return {
      selected: null,
      fileCount: files.length,
      eligibleFileCount: 0,
      rejectionReason: `No eligible top-surface PDF was found in this torrent: ${qbittorrentPdfRejectionSummary(files)}`,
    };
  }
  const selected =
    rankedFiles.find((file) =>
      selectedTorrentFileIsTrusted(
        file,
        candidate,
        request,
        rankedFiles.length,
      ),
    ) ?? null;
  return {
    selected,
    fileCount: files.length,
    eligibleFileCount: rankedFiles.length,
    rejectionReason: selected
      ? undefined
      : 'Top-surface PDFs were present, but none passed the title, author, or ISBN trust checks.',
  };
}

export function selectedTorrentFileIsTrusted(
  file: TorrentFile,
  candidate: DocumentCandidate,
  request: DocumentAcquisitionRequest,
  eligibleFileCount = 1,
): boolean {
  const fileScore = fileMatchScore(file, request);
  return Boolean(
    (candidate.matchScore ?? 0) >= MIN_TORRENT_MATCH_SCORE &&
    (fileScore >= MIN_SELECTED_FILE_MATCH_SCORE ||
      candidateCanTrustSingleFile(file, candidate, request, eligibleFileCount)),
  );
}

function candidateCanTrustSingleFile(
  file: TorrentFile,
  candidate: DocumentCandidate,
  request: DocumentAcquisitionRequest,
  eligibleFileCount: number,
): boolean {
  const name = file.name ?? '';
  if (eligibleFileCount !== 1) return false;
  if ((candidate.matchScore ?? 0) < 0.8) return false;
  if (!qbittorrentPdfEligibility(file).eligible) return false;
  return (
    isbnAppearsInText(request.book.isbn, name) ||
    authorAppearsInText(request.book.authors, name) ||
    hasExactQbittorrentTitlePhrase(name, request) ||
    (!request.book.authors.length && !request.book.isbn)
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
