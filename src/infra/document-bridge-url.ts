export function bridgeEndpoint(baseUrl: string, endpoint: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${endpoint}`;
}

export function bridgeDocumentEndpoint(
  baseUrl: string,
  endpoint: string,
  storagePath: string,
): string {
  return `${bridgeEndpoint(baseUrl, endpoint)}?${new URLSearchParams({ path: storagePath }).toString()}`;
}
