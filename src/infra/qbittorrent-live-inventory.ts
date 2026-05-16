import type {
  BookDocumentAvailability,
  BookRecord,
  QbittorrentConnectionSettings,
} from '../core/types';
import { normalizeMatcherText } from '../core/matchers';
import type {
  DocumentAcquisitionPolicy,
  DocumentAcquisitionRequest,
} from './document-acquisition';
import {
  defaultDocumentAcquisitionPolicy,
  type DocumentCandidate,
} from './document-acquisition';
import { contentKindPriorityForPreference } from './document-content-priority';
import { documentCandidateQualityScore } from './document-candidate-quality';
import { QBittorrentClient, settingsToOptions } from './qbittorrent-client';
import { contentKindFromUrl } from './qbittorrent-file-kinds';
import { qbittorrentPdfEligibility } from './qbittorrent-pdf-eligibility';
import {
  bookMatchScore,
  hasRequiredQbittorrentAuthorEvidence,
  hasRequiredQbittorrentTitleEvidence,
  hashFromMagnet,
  MIN_TORRENT_MATCH_SCORE,
  torrentAvailability,
} from './qbittorrent-selection';
import type { TorrentFile, TorrentInfo } from './qbittorrent-types';

export type QbittorrentLiveStaleStatus =
  | 'complete'
  | 'active'
  | 'metadata_pending'
  | 'stalled'
  | 'paused'
  | 'unknown';

export interface QbittorrentLiveFile {
  index: number | null;
  name: string;
  sizeBytes: number | null;
  progress: number;
  priority: number | null;
  availability: number | null;
  pdfEligible: boolean;
  pdfRejectionReasons: string[];
}

export interface QbittorrentLiveTorrent {
  hash: string;
  name: string;
  sourceUrl: string;
  category: string;
  savePath: string;
  contentPath: string;
  availability: BookDocumentAvailability;
  staleStatus: QbittorrentLiveStaleStatus;
  files: QbittorrentLiveFile[];
  eligiblePdfCount: number;
  matchScore?: number;
  qualityScore?: number;
  qualityReason?: string;
}

export interface QbittorrentLiveInventory {
  torrents: QbittorrentLiveTorrent[];
  errors: string[];
}

export interface QbittorrentBookInventoryMatch {
  torrent: QbittorrentLiveTorrent;
  candidate: DocumentCandidate;
}

const PAUSED_STATE_PATTERN = /(?:paused|stopped|queued)/i;
const METADATA_PENDING_STATE_PATTERN = /(?:metaDL|checkingResumeData)/i;
const LIVE_STALLED_STATE_PATTERN = /(?:stalledDL|error|missingFiles|unknown)/i;

export function normalizeTorrentHash(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

export function torrentSourceUrl(info: TorrentInfo): string {
  const hash = normalizeTorrentHash(info.hash);
  return info.magnet_uri || (hash ? `magnet:?xt=urn:btih:${hash}` : '');
}

export function liveTorrentStatus(
  info: TorrentInfo,
): QbittorrentLiveStaleStatus {
  const state = String(info.state ?? '');
  const progress = info.progress ?? 0;
  if (progress >= 1 || info.amount_left === 0) return 'complete';
  if (METADATA_PENDING_STATE_PATTERN.test(state)) return 'metadata_pending';
  if (PAUSED_STATE_PATTERN.test(state)) return 'paused';
  if (LIVE_STALLED_STATE_PATTERN.test(state)) return 'stalled';
  if ((info.dlspeed ?? 0) > 0 || progress > 0) return 'active';
  return state ? 'unknown' : 'unknown';
}

export function normalizeLiveFile(file: TorrentFile): QbittorrentLiveFile {
  const eligibility = qbittorrentPdfEligibility(file);
  return {
    index: file.index ?? null,
    name: file.name ?? '',
    sizeBytes: file.size ?? null,
    progress: Math.max(0, Math.min(1, file.progress ?? 0)),
    priority: file.priority ?? null,
    availability: file.availability ?? null,
    pdfEligible: eligibility.eligible,
    pdfRejectionReasons: eligibility.reasons,
  };
}

export function normalizeLiveTorrent(
  info: TorrentInfo,
  files: TorrentFile[] = [],
): QbittorrentLiveTorrent {
  const normalizedFiles = files.map(normalizeLiveFile);
  const availability = torrentAvailability(info);
  const sourceUrl = torrentSourceUrl(info);
  return {
    hash: normalizeTorrentHash(info.hash),
    name: info.name ?? info.content_path ?? sourceUrl,
    sourceUrl,
    category: info.category ?? '',
    savePath: info.save_path ?? '',
    contentPath: info.content_path ?? '',
    availability,
    staleStatus: liveTorrentStatus(info),
    files: normalizedFiles,
    eligiblePdfCount: normalizedFiles.filter((file) => file.pdfEligible)
      .length,
  };
}

export async function readQbittorrentLiveInventory(
  client: QBittorrentClient,
): Promise<QbittorrentLiveInventory> {
  const errors: string[] = [];
  await client.login();
  const torrents = await client.listTorrents();
  const liveTorrents = await Promise.all(
    torrents.map(async (torrent) => {
      const hash = normalizeTorrentHash(torrent.hash);
      const files = hash
        ? await client.torrentFiles(hash).catch((error) => {
            errors.push(
              error instanceof Error
                ? error.message
                : `Could not read files for ${hash}.`,
            );
            return [];
          })
        : [];
      return normalizeLiveTorrent(torrent, files);
    }),
  );
  return {
    torrents: liveTorrents.sort(
      (left, right) =>
        left.name.localeCompare(right.name) || left.hash.localeCompare(right.hash),
    ),
    errors,
  };
}

function liveTorrentEvidence(torrent: QbittorrentLiveTorrent): string {
  return normalizeMatcherText(
    [
      torrent.name,
      torrent.contentPath,
      torrent.sourceUrl,
      ...torrent.files.map((file) => file.name),
    ].join(' '),
  );
}

function liveTorrentIdentityEvidence(torrent: QbittorrentLiveTorrent): string {
  return normalizeMatcherText(
    [
      torrent.name,
      torrent.contentPath,
      ...torrent.files.map((file) => file.name),
    ].join(' '),
  );
}

export function candidateFromLiveTorrent(
  torrent: QbittorrentLiveTorrent,
  request: DocumentAcquisitionRequest,
): DocumentCandidate | null {
  const title = torrent.name || torrent.contentPath || request.book.title;
  const contentKind = contentKindFromUrl(torrent.contentPath || title);
  if (contentKind !== 'unknown' && contentKind !== 'pdf') return null;
  const evidence = liveTorrentEvidence(torrent);
  const matchScore = bookMatchScore(evidence, request);
  if (matchScore < MIN_TORRENT_MATCH_SCORE) return null;
  if (!hasRequiredQbittorrentTitleEvidence(evidence, request)) return null;
  if (
    !hasRequiredQbittorrentAuthorEvidence(
      liveTorrentIdentityEvidence(torrent),
      request,
    )
  ) {
    return null;
  }
  const sourceUrl = torrent.sourceUrl;
  if (!sourceUrl) return null;
  const candidate = {
    id: `qbittorrent-live:${request.book.id}:${torrent.hash || hashFromMagnet(sourceUrl) || title}`,
    provider: 'qbittorrent',
    title,
    sourceUrl,
    contentKind,
    accessBasis: 'user_owned' as const,
    confidence: Math.min(0.98, 0.54 + matchScore * 0.34),
    matchScore,
    seeders: torrent.availability.seeders,
    peers: torrent.availability.peers,
    sizeBytes: torrent.availability.sizeBytes ?? undefined,
    availability: torrent.availability,
    qualityReason:
      torrent.staleStatus === 'metadata_pending'
        ? 'Torrent is tracked but qBittorrent has not exposed file metadata yet.'
        : `${torrent.availability.seeders ?? 0} seeder(s), ${Math.round(
            (torrent.availability.progress ?? 0) * 100,
          )}% tracked.`,
  };
  const priorityFor = contentKindPriorityForPreference(
    request.policy.contentPreference,
  );
  return {
    ...candidate,
    qualityScore: documentCandidateQualityScore(candidate, priorityFor),
  };
}

export function liveInventoryMatchesForBook(
  inventory: QbittorrentLiveInventory,
  book: BookRecord,
  policy: DocumentAcquisitionPolicy = defaultDocumentAcquisitionPolicy(),
): QbittorrentBookInventoryMatch[] {
  const request: DocumentAcquisitionRequest = { book, policy };
  return inventory.torrents
    .map((torrent): QbittorrentBookInventoryMatch | null => {
      const candidate = candidateFromLiveTorrent(torrent, request);
      return candidate ? { torrent, candidate } : null;
    })
    .filter((match): match is QbittorrentBookInventoryMatch => Boolean(match))
    .sort(
      (left, right) =>
        (right.candidate.qualityScore ?? 0) -
          (left.candidate.qualityScore ?? 0) ||
        left.torrent.name.localeCompare(right.torrent.name),
    );
}

export async function readQbittorrentLiveInventoryFromSettings(
  settings: QbittorrentConnectionSettings,
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<QbittorrentLiveInventory> {
  const client = new QBittorrentClient(settingsToOptions(settings, fetchImpl));
  return readQbittorrentLiveInventory(client);
}
