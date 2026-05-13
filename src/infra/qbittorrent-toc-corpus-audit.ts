import type {
  BookDocumentBlockedCandidateOption,
  BookDocumentCandidateOption,
  BookDocumentRef,
  BookRecord,
  PlannerProjectV1,
} from '../core/types';
import type { BridgeOcrStatus } from './qbittorrent-document-api';
import {
  defaultDocumentAcquisitionPolicy,
  type DocumentAcquisitionPolicy,
} from './document-acquisition';
import { extractDocumentChapters } from './document-text-extractor';
import { contentKindFromUrl } from './qbittorrent-file-kinds';
import {
  liveInventoryMatchesForBook,
  type QbittorrentLiveInventory,
  type QbittorrentLiveTorrent,
} from './qbittorrent-live-inventory';
import { isoTimestamp } from './cache-time';

export type QbittorrentTocFailureClass =
  | 'toc_ready'
  | 'manual_toc_ready'
  | 'pdf_ready_no_toc'
  | 'ocr_needed'
  | 'pdf_candidate_found'
  | 'pdf_unavailable'
  | 'candidate_blocked'
  | 'metadata_sparse'
  | 'no_candidate';

export interface CorpusAuditLocalDocument {
  path: string;
  name: string;
  contentType: string;
  bytes?: Uint8Array;
  text?: string;
  ocrStatus?: BridgeOcrStatus;
}

export interface CorpusAuditLocalDocumentResult {
  path: string;
  name: string;
  contentKind: string;
  strategy: string | null;
  chapterCount: number;
  hasPageRanges: boolean;
  ocrStatus: BridgeOcrStatus['status'] | null;
  ocrConfidence: number | null;
  ocrPageRange: { start: number; end: number } | null;
  matchedBookIds: string[];
  failureClass: 'toc_ready' | 'ocr_needed' | 'not_matched';
}

export interface CorpusAuditBookRow {
  bookId: string;
  title: string;
  authors: string[];
  isbn: string | null;
  metadataCompleteness: number;
  existingDocuments: Array<{
    id: string;
    status: BookDocumentRef['status'];
    contentKind: BookDocumentRef['contentKind'];
    fileName: string;
    hasTorrentHash: boolean;
    hasSelectedFile: boolean;
  }>;
  liveMatches: Array<{
    hash: string;
    name: string;
    staleStatus: QbittorrentLiveTorrent['staleStatus'];
    progress: number;
    seeders: number | null;
    eligiblePdfCount: number;
    matchScore: number | null;
    qualityScore: number | null;
  }>;
  candidateQueue: Array<{
    rank: number | null;
    title: string;
    sourceUrl: string;
    seeders: number | null;
    matchScore: number | null;
    qualityScore: number | null;
    greylistPenalty: number | null;
  }>;
  blockedCandidates: Array<{
    title: string;
    sourceUrl: string;
    reasons: string[];
    retryableAsUserOwned: boolean;
  }>;
  tocSource: string;
  chapterCount: number;
  hasChapterPageRanges: boolean;
  failureClass: QbittorrentTocFailureClass;
  diagnostics: string[];
}

export interface QbittorrentTocCorpusAudit {
  generatedAt: string;
  projectBookCount: number;
  qbitTorrentCount: number;
  localDocumentCount: number;
  books: CorpusAuditBookRow[];
  localDocuments: CorpusAuditLocalDocumentResult[];
  summary: {
    tocReady: number;
    pdfCandidates: number;
    ocrNeeded: number;
    blocked: number;
    noCandidate: number;
  };
  errors: string[];
}

const MATCHED_LOCAL_DOCUMENT_SCORE = 0.42;

function nonEmptyCount(values: Array<unknown>): number {
  return values.filter((value) =>
    Array.isArray(value) ? value.length > 0 : Boolean(value),
  ).length;
}

export function bookMetadataCompleteness(book: BookRecord): number {
  const filled = nonEmptyCount([
    book.title,
    book.authors,
    book.isbn,
    book.publisher,
    book.year,
    book.subjects,
    book.enrichment.description,
    book.enrichment.chapters,
    book.pages > 1,
  ]);
  return Math.round((filled / 9) * 100) / 100;
}

function candidateSummary(candidate: BookDocumentCandidateOption): {
  rank: number | null;
  title: string;
  sourceUrl: string;
  seeders: number | null;
  matchScore: number | null;
  qualityScore: number | null;
  greylistPenalty: number | null;
} {
  return {
    rank: candidate.rank ?? null,
    title: candidate.title,
    sourceUrl: candidate.sourceUrl,
    seeders: candidate.seeders ?? candidate.availability?.seeders ?? null,
    matchScore: candidate.matchScore ?? null,
    qualityScore: candidate.qualityScore ?? null,
    greylistPenalty: candidate.greylistPenalty ?? null,
  };
}

function blockedSummary(candidate: BookDocumentBlockedCandidateOption): {
  title: string;
  sourceUrl: string;
  reasons: string[];
  retryableAsUserOwned: boolean;
} {
  return {
    title: candidate.title,
    sourceUrl: candidate.sourceUrl,
    reasons: candidate.blockedReasons,
    retryableAsUserOwned: Boolean(candidate.retryableAsUserOwned),
  };
}

function auditDocumentRefSummary(document: BookDocumentRef): {
  id: string;
  status: BookDocumentRef['status'];
  contentKind: BookDocumentRef['contentKind'];
  fileName: string;
  hasTorrentHash: boolean;
  hasSelectedFile: boolean;
} {
  return {
    id: document.id,
    status: document.status,
    contentKind: document.contentKind,
    fileName: document.fileName,
    hasTorrentHash: Boolean(document.torrentHash),
    hasSelectedFile: document.fileIndex != null,
  };
}

function classifyBook(row: Omit<CorpusAuditBookRow, 'failureClass'>): {
  failureClass: QbittorrentTocFailureClass;
  diagnostics: string[];
} {
  const diagnostics: string[] = [];
  if (row.chapterCount > 0 && row.tocSource === 'manual') {
    return { failureClass: 'manual_toc_ready', diagnostics };
  }
  if (row.chapterCount > 0) {
    if (!row.hasChapterPageRanges) {
      diagnostics.push('TOC exists but has no trusted chapter page ranges.');
    }
    return { failureClass: 'toc_ready', diagnostics };
  }
  const hasCompletePdf = row.existingDocuments.some(
    (document) => document.status === 'complete' && document.contentKind === 'pdf',
  );
  if (hasCompletePdf) {
    diagnostics.push('Trusted PDF is available but no TOC was accepted.');
    return { failureClass: 'ocr_needed', diagnostics };
  }
  const hasPdfDocument = row.existingDocuments.some(
    (document) => document.contentKind === 'pdf',
  );
  if (hasPdfDocument) {
    diagnostics.push('PDF is tracked but not complete or readable yet.');
    return { failureClass: 'pdf_ready_no_toc', diagnostics };
  }
  if (row.liveMatches.some((match) => match.eligiblePdfCount > 0)) {
    diagnostics.push('qBittorrent has a matching torrent with eligible PDFs.');
    return { failureClass: 'pdf_candidate_found', diagnostics };
  }
  if (row.liveMatches.length) {
    diagnostics.push('qBittorrent matches exist but no top-surface PDF is eligible.');
    return { failureClass: 'pdf_unavailable', diagnostics };
  }
  if (row.blockedCandidates.length) {
    diagnostics.push('Search found blocked candidates; inspect rejection reasons.');
    return { failureClass: 'candidate_blocked', diagnostics };
  }
  if (row.metadataCompleteness < 0.45) {
    diagnostics.push('Book metadata is sparse, so search disambiguation is weak.');
    return { failureClass: 'metadata_sparse', diagnostics };
  }
  return { failureClass: 'no_candidate', diagnostics };
}

function localDocumentMatchesBook(
  document: CorpusAuditLocalDocumentResult,
  book: BookRecord,
  policy: DocumentAcquisitionPolicy,
): boolean {
  const fakeInventory: QbittorrentLiveInventory = {
    errors: [],
    torrents: [
      {
        hash: '',
        name: document.name,
        sourceUrl: `file://${document.path}`,
        category: '',
        savePath: '',
        contentPath: document.path,
        staleStatus: 'complete',
        eligiblePdfCount: document.contentKind === 'pdf' ? 1 : 0,
        files: [],
        availability: {
          seeders: null,
          peers: null,
          progress: 1,
          state: 'local-file',
        },
      },
    ],
  };
  return liveInventoryMatchesForBook(fakeInventory, book, policy).some(
    (match) => (match.candidate.matchScore ?? 0) >= MATCHED_LOCAL_DOCUMENT_SCORE,
  );
}

export function auditLocalDocument(
  document: CorpusAuditLocalDocument,
): CorpusAuditLocalDocumentResult {
  const contentKind = contentKindFromUrl(document.path);
  const extraction = extractDocumentChapters({
    bytes: document.bytes,
    text: document.text,
    contentType: document.contentType,
    sourceUrl: document.path,
  });
  const chapterCount = extraction?.chapters.length ?? 0;
  return {
    path: document.path,
    name: document.name,
    contentKind,
    strategy: extraction?.strategy ?? null,
    chapterCount,
    hasPageRanges: Boolean(
      extraction?.chapterPageRanges?.some((range) => range?.start),
    ),
    ocrStatus: document.ocrStatus?.status ?? null,
    ocrConfidence: document.ocrStatus?.metadata?.confidence ?? null,
    ocrPageRange: document.ocrStatus?.metadata?.pageRange ?? null,
    matchedBookIds: [],
    failureClass:
      chapterCount > 0
        ? 'toc_ready'
        : contentKind === 'pdf'
          ? 'ocr_needed'
          : 'not_matched',
  };
}

export function buildQbittorrentTocCorpusAudit(input: {
  project: PlannerProjectV1;
  inventory?: QbittorrentLiveInventory;
  localDocuments?: CorpusAuditLocalDocument[];
  policy?: DocumentAcquisitionPolicy;
  generatedAt?: string;
  errors?: string[];
}): QbittorrentTocCorpusAudit {
  const policy = input.policy ?? defaultDocumentAcquisitionPolicy();
  const inventory = input.inventory ?? { torrents: [], errors: [] };
  const books = Object.values(input.project.library.books);
  const localDocuments = (input.localDocuments ?? []).map(auditLocalDocument);
  localDocuments.forEach((document) => {
    document.matchedBookIds = books
      .filter((book) => localDocumentMatchesBook(document, book, policy))
      .map((book) => book.id)
      .sort();
  });
  const rows = books.map((book): CorpusAuditBookRow => {
    const liveMatches = liveInventoryMatchesForBook(inventory, book, policy)
      .slice(0, 5)
      .map((match) => ({
        hash: match.torrent.hash,
        name: match.torrent.name,
        staleStatus: match.torrent.staleStatus,
        progress: match.torrent.availability.progress,
        seeders: match.torrent.availability.seeders,
        eligiblePdfCount: match.torrent.eligiblePdfCount,
        matchScore: match.candidate.matchScore ?? null,
        qualityScore: match.candidate.qualityScore ?? null,
      }));
    const baseRow = {
      bookId: book.id,
      title: book.title,
      authors: book.authors,
      isbn: book.isbn,
      metadataCompleteness: bookMetadataCompleteness(book),
      existingDocuments: (book.documents ?? []).map(auditDocumentRefSummary),
      liveMatches,
      candidateQueue: (book.documentAcquisition?.candidateQueue ?? [])
        .slice(0, 10)
        .map(candidateSummary),
      blockedCandidates: (book.documentAcquisition?.blockedCandidates ?? [])
        .slice(0, 10)
        .map(blockedSummary),
      tocSource: book.enrichment.tocSource,
      chapterCount: book.enrichment.chapters.length,
      hasChapterPageRanges: Boolean(
        book.enrichment.chapterPageRanges?.some((range) => range?.start),
      ),
      diagnostics: [] as string[],
    };
    const classification = classifyBook(baseRow);
    return { ...baseRow, ...classification };
  });
  return {
    generatedAt: input.generatedAt ?? isoTimestamp(),
    projectBookCount: books.length,
    qbitTorrentCount: inventory.torrents.length,
    localDocumentCount: localDocuments.length,
    books: rows,
    localDocuments,
    summary: {
      tocReady: rows.filter((row) =>
        ['toc_ready', 'manual_toc_ready'].includes(row.failureClass),
      ).length,
      pdfCandidates: rows.filter(
        (row) => row.failureClass === 'pdf_candidate_found',
      ).length,
      ocrNeeded: rows.filter((row) => row.failureClass === 'ocr_needed').length,
      blocked: rows.filter((row) => row.failureClass === 'candidate_blocked')
        .length,
      noCandidate: rows.filter((row) =>
        ['metadata_sparse', 'no_candidate', 'pdf_unavailable'].includes(
          row.failureClass,
        ),
      ).length,
    },
    errors: [...(input.errors ?? []), ...inventory.errors],
  };
}
