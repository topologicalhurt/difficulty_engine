import type {
  BookEnrichment,
  BookRecord,
  EnrichmentFieldProvenance,
  SourceSettings,
} from '../core/types';
import { compactItems } from '../core/utils';
import { documentSourceEnabled } from '../core/source-settings-policy';
import {
  BRIDGE_DOCUMENT_MAX_BYTES,
  fetchWithTimeout,
  readLimitedResponseBytes,
} from './bridge-fetch';
import { extractDocumentChapters } from './document-text-extractor';
import type { AcquiredDocument } from './document-acquisition';
import { isPdfDocument } from './qbittorrent-file-kinds';
import { isLoopbackHost } from './url-security';
import type {
  ChapterPageRangeTrust,
  PageAnchorEvidence,
} from './toc-page-ranges';

// The buffered-document byte cap is shared with the bridge document reads so
// the two surfaces that use readLimitedResponseBytes enforce one limit.
const DIRECT_DOCUMENT_TIMEOUT_MS = 30_000;

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
  topics?: string[];
  topicPageRanges?: BookEnrichment['topicPageRanges'];
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
    topics: extraction.topics,
    topicPageRanges: extraction.topicPageRanges,
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

export async function sourceDocumentCandidate(
  context: SourceDocumentContext,
): Promise<SourceDocumentCandidate | null> {
  const sourcePath = context.book.sourcePath?.trim();
  if (!sourcePath || !context.fetchImpl) return null;
  if (!allowedDirectDocumentUrl(sourcePath)) return null;
  if (!documentSourceEnabled(context.sourceSettings, 'directUrl')) return null;
  try {
    // Bound the direct download (linked to the caller's signal) so a slow or
    // stalled HTTPS source cannot hang acquisition; the body is size-capped.
    const response = await fetchWithTimeout(
      context.fetchImpl,
      sourcePath,
      {
        headers: {
          Accept: 'application/pdf,text/plain,text/html;q=0.9,*/*;q=0.5',
        },
      },
      DIRECT_DOCUMENT_TIMEOUT_MS,
      context.signal,
    );
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') ?? '';
    const bytes = await readLimitedResponseBytes(
      response,
      BRIDGE_DOCUMENT_MAX_BYTES,
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
          pageAnchors: document.pageAnchors,
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
