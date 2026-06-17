import {
  BRIDGE_DOCUMENT_MAX_BYTES,
  BRIDGE_DOCUMENT_TIMEOUT_MS,
  fetchWithTimeout,
  readLimitedResponseBytes,
} from './bridge-fetch';
import { bridgeDocumentEndpoint } from './document-bridge-url';
import type { PageAnchorEvidence } from './toc-page-ranges';

export interface BridgeOcrStatus {
  ok: boolean;
  status: 'complete' | 'pending' | 'unavailable' | 'failed';
  text?: string;
  sidecarPath?: string;
  reason?: string;
  metadata?: {
    pageRange?: { start: number; end: number };
    confidence?: number;
    psmModes?: string[];
    toolVersions?: Record<string, string>;
  };
}

export interface BridgePdfStructureStatus {
  ok: boolean;
  status: 'complete' | 'unavailable' | 'failed';
  physicalPageCount?: number;
  pageLabels?: Array<string | null>;
  pageAnchors?: PageAnchorEvidence[];
  reason?: string;
  toolVersions?: Record<string, string>;
}

// Parse a bridge JSON body defensively: a non-JSON 200 (e.g. a proxy/SPA HTML
// page) must degrade to undefined, not throw a bare SyntaxError up the stack.
async function readBridgeJson<T>(response: Response): Promise<T | undefined> {
  try {
    return (await response.json()) as T;
  } catch {
    return undefined;
  }
}

export async function bridgeDocumentExists(
  fetchImpl: typeof fetch,
  baseUrl: string,
  storagePath: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const response = await fetchWithTimeout(
    fetchImpl,
    bridgeDocumentEndpoint(baseUrl, '/documents/status', storagePath),
    {},
    BRIDGE_DOCUMENT_TIMEOUT_MS,
    signal,
  );
  return response.ok;
}

export async function readBridgeTextDocument(
  fetchImpl: typeof fetch,
  baseUrl: string,
  storagePath: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const response = await fetchWithTimeout(
    fetchImpl,
    bridgeDocumentEndpoint(baseUrl, '/documents/read-text', storagePath),
    {},
    BRIDGE_DOCUMENT_TIMEOUT_MS,
    signal,
  );
  return response.ok ? await response.text() : undefined;
}

export async function readBridgeByteDocument(
  fetchImpl: typeof fetch,
  baseUrl: string,
  storagePath: string,
  signal?: AbortSignal,
): Promise<Uint8Array | undefined> {
  const response = await fetchWithTimeout(
    fetchImpl,
    bridgeDocumentEndpoint(baseUrl, '/documents/read-bytes', storagePath),
    {},
    BRIDGE_DOCUMENT_TIMEOUT_MS,
    signal,
  );
  if (!response.ok) return undefined;
  const bytes = await readLimitedResponseBytes(response, BRIDGE_DOCUMENT_MAX_BYTES);
  return bytes ?? undefined;
}

export async function requestBridgeEmbeddedPdfText(
  fetchImpl: typeof fetch,
  baseUrl: string,
  storagePath: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const response = await fetchWithTimeout(
    fetchImpl,
    bridgeDocumentEndpoint(baseUrl, '/documents/extract-text', storagePath),
    {},
    BRIDGE_DOCUMENT_TIMEOUT_MS,
    signal,
  );
  if (!response.ok) return undefined;
  const payload = await readBridgeJson<{ text?: string }>(response);
  return payload?.text?.trim() ? payload.text : undefined;
}

export async function requestBridgePdfStructure(
  fetchImpl: typeof fetch,
  baseUrl: string,
  storagePath: string,
  signal?: AbortSignal,
): Promise<BridgePdfStructureStatus | undefined> {
  const response = await fetchWithTimeout(
    fetchImpl,
    bridgeDocumentEndpoint(baseUrl, '/documents/pdf-structure', storagePath),
    {},
    BRIDGE_DOCUMENT_TIMEOUT_MS,
    signal,
  );
  return response.ok
    ? await readBridgeJson<BridgePdfStructureStatus>(response)
    : undefined;
}

export async function requestBridgeOcrToc(
  fetchImpl: typeof fetch,
  baseUrl: string,
  storagePath: string,
  signal?: AbortSignal,
): Promise<BridgeOcrStatus | undefined> {
  const response = await fetchWithTimeout(
    fetchImpl,
    bridgeDocumentEndpoint(baseUrl, '/documents/ocr-toc', storagePath),
    { method: 'POST' },
    BRIDGE_DOCUMENT_TIMEOUT_MS,
    signal,
  );
  return response.ok ? await readBridgeJson<BridgeOcrStatus>(response) : undefined;
}

export async function requestBridgeOcrStatus(
  fetchImpl: typeof fetch,
  baseUrl: string,
  storagePath: string,
  signal?: AbortSignal,
): Promise<BridgeOcrStatus | undefined> {
  const response = await fetchWithTimeout(
    fetchImpl,
    bridgeDocumentEndpoint(baseUrl, '/documents/ocr-status', storagePath),
    {},
    BRIDGE_DOCUMENT_TIMEOUT_MS,
    signal,
  );
  return response.ok ? await readBridgeJson<BridgeOcrStatus>(response) : undefined;
}

export async function postBridgeDocumentAction(
  fetchImpl: typeof fetch,
  baseUrl: string,
  endpoint: string,
  storagePath: string,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetchWithTimeout(
    fetchImpl,
    `${baseUrl.replace(/\/+$/, '')}${endpoint}`,
    {
      method: 'POST',
      body: JSON.stringify({ path: storagePath }),
      headers: { 'Content-Type': 'application/json' },
    },
    BRIDGE_DOCUMENT_TIMEOUT_MS,
    signal,
  );
  if (!response.ok) throw new Error(await response.text());
}
