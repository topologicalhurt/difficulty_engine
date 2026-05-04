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
