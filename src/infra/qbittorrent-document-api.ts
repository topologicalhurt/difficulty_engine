import { bridgeDocumentEndpoint } from './document-bridge-url';

export interface BridgeOcrStatus {
  ok: boolean;
  status: 'complete' | 'pending' | 'unavailable' | 'failed';
  text?: string;
  sidecarPath?: string;
  reason?: string;
}

export async function bridgeDocumentExists(
  fetchImpl: typeof fetch,
  baseUrl: string,
  storagePath: string,
): Promise<boolean> {
  const response = await fetchImpl(
    bridgeDocumentEndpoint(baseUrl, '/documents/status', storagePath),
  );
  return response.ok;
}

export async function readBridgeTextDocument(
  fetchImpl: typeof fetch,
  baseUrl: string,
  storagePath: string,
): Promise<string | undefined> {
  const response = await fetchImpl(
    bridgeDocumentEndpoint(baseUrl, '/documents/read-text', storagePath),
  );
  return response.ok ? await response.text() : undefined;
}

export async function readBridgeByteDocument(
  fetchImpl: typeof fetch,
  baseUrl: string,
  storagePath: string,
): Promise<Uint8Array | undefined> {
  const response = await fetchImpl(
    bridgeDocumentEndpoint(baseUrl, '/documents/read-bytes', storagePath),
  );
  return response.ok ? new Uint8Array(await response.arrayBuffer()) : undefined;
}

export async function requestBridgeEmbeddedPdfText(
  fetchImpl: typeof fetch,
  baseUrl: string,
  storagePath: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const response = await fetchImpl(
    bridgeDocumentEndpoint(baseUrl, '/documents/extract-text', storagePath),
    { signal },
  );
  if (!response.ok) return undefined;
  const payload = (await response.json()) as { text?: string };
  return payload.text?.trim() ? payload.text : undefined;
}

export async function requestBridgeOcrToc(
  fetchImpl: typeof fetch,
  baseUrl: string,
  storagePath: string,
  signal?: AbortSignal,
): Promise<BridgeOcrStatus | undefined> {
  const response = await fetchImpl(
    bridgeDocumentEndpoint(baseUrl, '/documents/ocr-toc', storagePath),
    { method: 'POST', signal },
  );
  return response.ok ? ((await response.json()) as BridgeOcrStatus) : undefined;
}

export async function postBridgeDocumentAction(
  fetchImpl: typeof fetch,
  baseUrl: string,
  endpoint: string,
  storagePath: string,
): Promise<void> {
  const response = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}${endpoint}`, {
    method: 'POST',
    body: JSON.stringify({ path: storagePath }),
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) throw new Error(await response.text());
}
