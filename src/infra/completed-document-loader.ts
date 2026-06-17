import type { BookDocumentRef, EnrichmentRequest, Logger } from '../core/types';
import {
  localOcrEnabled,
  sourceEnabledForDocumentProvider,
} from '../core/source-settings-policy';
import type { AcquiredDocument } from './document-acquisition';
import { isoTimestamp } from './cache-time';
import { extractDocumentChapters } from './document-text-extractor';
import {
  readBridgeByteDocument,
  readBridgeTextDocument,
  requestBridgeEmbeddedPdfText,
  requestBridgePdfStructure,
  requestBridgeOcrToc,
} from './qbittorrent-document-api';

const MIN_OCR_TOC_CONFIDENCE = 0.65;
const REUSABLE_DOCUMENT_STATUSES = new Set<BookDocumentRef['status']>([
  'complete',
  'unreadable',
]);
const TEXT_KINDS = new Set<BookDocumentRef['contentKind']>([
  'text',
  'ocr_text',
]);

function canReuseDocument(
  document: BookDocumentRef,
  settings: EnrichmentRequest['sourceSettings'],
): boolean {
  if (!sourceEnabledForDocumentProvider(document, settings)) return false;
  if (!REUSABLE_DOCUMENT_STATUSES.has(document.status)) return false;
  if (document.provider === 'qbittorrent')
    return document.contentKind === 'pdf';
  return TEXT_KINDS.has(document.contentKind) || document.contentKind === 'pdf';
}

export async function loadCompletedDocumentRefs(
  request: EnrichmentRequest,
  fetchImpl: typeof fetch,
  logger: Logger,
): Promise<AcquiredDocument[]> {
  const baseUrl = request.qbittorrentConnection?.baseUrl;
  if (!baseUrl || !request.qbittorrentConnection?.enabled) return [];
  const documents = (request.book.documents ?? []).filter((document) =>
    canReuseDocument(document, request.sourceSettings),
  );
  const acquired: AcquiredDocument[] = [];
  for (const document of documents) {
    try {
      const rawText = TEXT_KINDS.has(document.contentKind)
        ? await readBridgeTextDocument(
            fetchImpl,
            baseUrl,
            document.storagePath,
            request.signal,
          ).catch(() => undefined)
        : undefined;
      const text = rawText && rawText.trim() ? rawText : undefined;
      const bytes =
        document.contentKind === 'pdf'
          ? await readBridgeByteDocument(
              fetchImpl,
              baseUrl,
              document.storagePath,
              request.signal,
            ).catch(() => undefined)
          : undefined;
      const embeddedText =
        document.contentKind === 'pdf'
          ? await requestBridgeEmbeddedPdfText(
              fetchImpl,
              baseUrl,
              document.storagePath,
              request.signal,
            ).catch(() => undefined)
          : undefined;
      const pdfStructure =
        document.contentKind === 'pdf'
          ? await requestBridgePdfStructure(
              fetchImpl,
              baseUrl,
              document.storagePath,
              request.signal,
            ).catch(() => undefined)
          : undefined;
      const pageAnchors =
        pdfStructure?.status === 'complete'
          ? pdfStructure.pageAnchors
          : undefined;
      const extractionWithoutOcr =
        text || embeddedText || bytes || pageAnchors?.length
          ? extractDocumentChapters({
              text: text ?? embeddedText,
              bytes,
              contentType: document.contentType,
              sourceUrl: document.sourceUrl ?? document.storagePath,
              pageAnchors,
            })
          : null;
      const ocr =
        !extractionWithoutOcr &&
        document.contentKind === 'pdf' &&
        localOcrEnabled(request.sourceSettings)
          ? await requestBridgeOcrToc(
              fetchImpl,
              baseUrl,
              document.storagePath,
              request.signal,
            ).catch(() => undefined)
          : undefined;
      const ocrConfidence = ocr?.metadata?.confidence;
      const ocrText =
        ocr?.status === 'complete' &&
        (ocrConfidence == null || ocrConfidence >= MIN_OCR_TOC_CONFIDENCE)
          ? ocr.text
          : undefined;
      if (
        !text &&
        !embeddedText &&
        !bytes &&
        !ocrText &&
        !extractionWithoutOcr
      ) {
        continue;
      }
      acquired.push({
        candidateId: document.id,
        provider: document.provider,
        sourceUrl: document.sourceUrl,
        storagePath: document.storagePath,
        contentType: document.contentType,
        accessBasis: document.accessBasis,
        confidence:
          document.provenance.confidence || document.matchScore || 0.6,
        text: text ?? embeddedText ?? ocrText,
        bytes,
        pageAnchors,
        sha256: document.sha256,
        documentRef:
          document.status === 'unreadable' && document.contentKind === 'pdf'
            ? { ...document, status: 'complete' }
            : document,
        acquiredAt: isoTimestamp(),
      });
    } catch (error) {
      logger.warn('enrichment.completed_document.read_failed', {
        bookId: request.book.id,
        documentId: document.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return acquired;
}

export function dedupeAcquiredDocuments(
  documents: AcquiredDocument[],
): AcquiredDocument[] {
  const byKey = new Map<string, AcquiredDocument>();
  documents.forEach((document) => {
    const key =
      document.documentRef?.id ??
      document.storagePath ??
      document.sourceUrl ??
      document.candidateId;
    const previous = byKey.get(key);
    if (
      !previous ||
      (!previous.text && document.text) ||
      (!previous.bytes && document.bytes)
    ) {
      byKey.set(key, document);
    }
  });
  return [...byKey.values()];
}
