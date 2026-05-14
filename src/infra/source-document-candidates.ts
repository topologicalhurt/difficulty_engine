import type {
  BookEnrichment,
  BookRecord,
  EnrichmentFieldProvenance,
  SourceSettings,
} from '../core/types';
import { compactItems } from '../core/utils';
import { documentSourceEnabled } from '../core/source-settings-policy';
import { extractDocumentChapters } from './document-text-extractor';
import type { AcquiredDocument } from './document-acquisition';
import { isPdfDocument } from './qbittorrent-file-kinds';
import { isLoopbackHost } from './url-security';
import type {
  ChapterPageRangeTrust,
  PageAnchorEvidence,
} from './toc-page-ranges';

const DIRECT_DOCUMENT_MAX_BYTES = 8 * 1024 * 1024;
const RESPONSE_CHUNK_MISSING_LENGTH = -1;

export interface SourceDocumentContext {
  book: BookRecord;
  fetchImpl?: typeof fetch;
  acquiredDocuments?: AcquiredDocument[];
  sourceSettings?: SourceSettings;
  signal?: AbortSignal;
}

export interface SourceDocumentCandidate {
  provider: EnrichmentFieldProvenance['provider'];
  sourceUrl: string;
  confidence: number;
  chapters?: string[];
  chapterPageRanges?: BookEnrichment['chapterPageRanges'];
  estimatedChapterPageRanges?: BookEnrichment['chapterPageRanges'];
  chapterPageRangeTrust?: ChapterPageRangeTrust[];
  pageAnchors?: PageAnchorEvidence[];
  trustedChapterPageRangeCount?: number;
  pageRangeTrustStatus?: ChapterPageRangeTrust;
  tocSource?: BookEnrichment['tocSource'];
  strategy?: string;
  inferred?: boolean;
  evidenceAnchors?: string[];
  rejectedReasons?: string[];
  pageRange?: { start: number; end: number };
}

function candidateFromExtraction(
  provider: string,
  sourceUrl: string,
  confidence: number,
  extraction: NonNullable<ReturnType<typeof extractDocumentChapters>>,
): SourceDocumentCandidate {
  const rejectedReasons = [
    ...(extraction.attempts
      ?.filter((attempt) => !attempt.accepted)
      .flatMap((attempt) => attempt.rejectedReasons) ?? []),
    ...(extraction.pageRangeRejectedReasons ?? []),
  ];
  return {
    provider,
    sourceUrl,
    confidence: Math.min(confidence, extraction.confidence),
    chapters: extraction.chapters,
    chapterPageRanges: extraction.chapterPageRanges,
    estimatedChapterPageRanges: extraction.estimatedChapterPageRanges,
    chapterPageRangeTrust: extraction.chapterPageRangeTrust,
    pageAnchors: extraction.pageAnchors,
    trustedChapterPageRangeCount: extraction.trustedChapterPageRangeCount,
    pageRangeTrustStatus: extraction.pageRangeTrustStatus,
    tocSource: 'pdf',
    strategy: extraction.strategy,
    inferred: extraction.inferred,
    evidenceAnchors: extraction.evidenceAnchors,
    rejectedReasons,
  };
}

function allowedDirectDocumentUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'https:') return true;
    return parsed.protocol === 'http:' && isLoopbackHost(parsed.hostname);
  } catch {
    return false;
  }
}

function contentLengthExceedsLimit(
  response: Response,
  limitBytes: number,
): boolean {
  const rawLength = response.headers.get('content-length');
  if (!rawLength) return false;
  const parsedLength = Number.parseInt(rawLength, 10);
  return Number.isFinite(parsedLength) && parsedLength > limitBytes;
}

async function readLimitedResponseBytes(
  response: Response,
  limitBytes: number,
): Promise<Uint8Array | null> {
  if (contentLengthExceedsLimit(response, limitBytes)) return null;

  if (!response.body?.getReader) {
    const fallbackBytes = new Uint8Array(await response.arrayBuffer());
    return fallbackBytes.length > limitBytes ? null : fallbackBytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength ?? RESPONSE_CHUNK_MISSING_LENGTH;
      if (totalBytes < 0 || totalBytes > limitBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function sourceDocumentCandidate(
  context: SourceDocumentContext,
): Promise<SourceDocumentCandidate | null> {
  const sourcePath = context.book.sourcePath?.trim();
  if (!sourcePath || !context.fetchImpl) return null;
  if (!allowedDirectDocumentUrl(sourcePath)) return null;
  if (!documentSourceEnabled(context.sourceSettings, 'directUrl')) return null;
  try {
    const response = await context.fetchImpl(sourcePath, {
      signal: context.signal,
      headers: {
        Accept: 'application/pdf,text/plain,text/html;q=0.9,*/*;q=0.5',
      },
    });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') ?? '';
    const bytes = await readLimitedResponseBytes(
      response,
      DIRECT_DOCUMENT_MAX_BYTES,
    );
    if (!bytes) return null;
    const extraction = isPdfDocument(sourcePath, contentType)
      ? extractDocumentChapters({
          bytes,
          contentType,
          sourceUrl: sourcePath,
        })
      : extractDocumentChapters({
          text: new TextDecoder().decode(bytes),
          contentType,
          sourceUrl: sourcePath,
        });
    return extraction
      ? candidateFromExtraction('direct_url', sourcePath, 0.7, extraction)
      : null;
  } catch {
    return null;
  }
}

export function acquiredDocumentCandidates(
  context: SourceDocumentContext,
): SourceDocumentCandidate[] {
  return compactItems(
    (context.acquiredDocuments ?? []).map(
      (document): SourceDocumentCandidate | null => {
        const extraction = extractDocumentChapters({
          text: document.text,
          bytes: document.bytes,
          contentType: document.contentType,
          sourceUrl: document.sourceUrl ?? document.storagePath,
        });
        if (!extraction) return null;
        return candidateFromExtraction(
          document.provider,
          document.sourceUrl ?? document.storagePath ?? 'local://document',
          document.confidence,
          extraction,
        );
      },
    ),
  );
}
