import type { BookEnrichment, BookRecord, EnrichmentFieldProvenance, SourceSettings } from '../core/types';
import { documentSourceEnabled } from '../core/source-settings-policy';
import { extractDocumentChapters } from './document-text-extractor';
import type { AcquiredDocument } from './document-acquisition';

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
  tocSource?: BookEnrichment['tocSource'];
  strategy?: string;
  inferred?: boolean;
  evidenceAnchors?: string[];
}

function candidateFromExtraction(
  provider: string,
  sourceUrl: string,
  confidence: number,
  extraction: NonNullable<ReturnType<typeof extractDocumentChapters>>,
): SourceDocumentCandidate {
  return {
    provider,
    sourceUrl,
    confidence: Math.min(confidence, extraction.confidence),
    chapters: extraction.chapters,
    tocSource: 'pdf',
    strategy: extraction.strategy,
    inferred: extraction.inferred,
    evidenceAnchors: extraction.evidenceAnchors,
  };
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
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
    const response = await context.fetchImpl(sourcePath, {
      signal: context.signal,
      headers: { Accept: 'application/pdf,text/plain,text/html;q=0.9,*/*;q=0.5' },
    });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') ?? '';
    const isPdf = contentType.includes('pdf') || /\.pdf(?:$|\?)/i.test(sourcePath);
    const extraction = isPdf
      ? extractDocumentChapters({
          bytes: new Uint8Array(await response.arrayBuffer()),
          contentType,
          sourceUrl: sourcePath,
        })
      : extractDocumentChapters({
          text: await response.text(),
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

export function acquiredDocumentCandidates(context: SourceDocumentContext): SourceDocumentCandidate[] {
  return (context.acquiredDocuments ?? [])
    .map((document): SourceDocumentCandidate | null => {
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
    })
    .filter(Boolean) as SourceDocumentCandidate[];
}
