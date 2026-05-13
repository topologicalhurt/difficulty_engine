import type { EnrichmentFieldProvenance } from './enrichment';
import type { SourceContentKind } from './source-settings';

export type BookDocumentStatus =
  | 'queued'
  | 'downloading'
  | 'complete'
  | 'failed'
  | 'stalled'
  | 'unreadable';

export interface BookDocumentAvailability {
  seeders: number | null;
  peers: number | null;
  progress: number;
  state: string;
  etaSeconds?: number | null;
  downloadSpeedBytesPerSecond?: number | null;
  availability?: number | null;
  sizeBytes?: number | null;
  qualityScore?: number;
  reason?: string;
}

export interface BookDocumentRef {
  id: string;
  provider: string;
  sourceUrl?: string;
  torrentHash?: string;
  fileIndex?: number;
  fileName: string;
  storagePath: string;
  contentKind: SourceContentKind;
  contentType: string;
  accessBasis: 'public_domain' | 'open_access' | 'user_owned' | 'user_provided';
  sha256?: string;
  status: BookDocumentStatus;
  matchScore: number;
  availability: BookDocumentAvailability;
  provenance: EnrichmentFieldProvenance;
  createdAt: string;
  updatedAt: string;
}

export interface BookDocumentCandidateOption {
  id: string;
  provider: string;
  title: string;
  sourceUrl: string;
  contentKind: SourceContentKind | 'unknown';
  accessBasis?: BookDocumentRef['accessBasis'];
  confidence: number;
  sizeBytes?: number;
  seeders?: number | null;
  peers?: number | null;
  matchScore?: number;
  qualityScore?: number;
  qualityReason?: string;
  greylistKey?: string;
  greylistPenalty?: number;
  greylistReason?: string;
  rank?: number;
  retryable?: boolean;
  queuedAt?: string;
  lastSeenAt?: string;
  availability?: BookDocumentAvailability;
}

export type QbittorrentSearchIntent =
  | 'isbn_exact'
  | 'core_title'
  | 'core_title_author'
  | 'author_topic'
  | 'hyphenated_title'
  | 'broad_recall'
  | 'custom_query';

export interface BookDocumentBlockedCandidateOption {
  id: string;
  provider: string;
  title: string;
  sourceUrl: string;
  contentKind: SourceContentKind | 'unknown';
  confidence: number;
  blockedReasons: string[];
  searchIntent?: QbittorrentSearchIntent;
  pattern?: string;
  plugin?: string;
  siteUrl?: string;
  seeders?: number | null;
  peers?: number | null;
  matchScore?: number;
  qualityScore?: number;
  qualityReason?: string;
  retryableAsUserOwned?: boolean;
  sizeBytes?: number;
  availability?: BookDocumentAvailability;
}

export interface BookDocumentSearchAttempt {
  id: string;
  provider: 'qbittorrent';
  intent: QbittorrentSearchIntent;
  pattern: string;
  plugins: string;
  category: string;
  resultCount: number;
  acceptedCount: number;
  blockedCount: number;
  pollDurationMs: number;
  status?: string;
  error?: string;
  rejectedReasons: string[];
  createdAt: string;
}

export interface BookDocumentGreylistEntry {
  key: string;
  penalty: number;
  observations: number;
  lastStatus: BookDocumentStatus | 'candidate';
  lastReason?: string;
  lastProgress?: number;
  lastProgressAt?: string;
  sourceUrl?: string;
  torrentHash?: string;
  title?: string;
  updatedAt: string;
}

export interface BookDocumentAcquisitionState {
  candidateQueue: BookDocumentCandidateOption[];
  blockedCandidates?: BookDocumentBlockedCandidateOption[];
  searchAttempts?: BookDocumentSearchAttempt[];
  greylist: Record<string, BookDocumentGreylistEntry>;
  lastDiagnostic?: string;
  updatedAt?: string;
}
