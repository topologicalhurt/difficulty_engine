export function bridgeDocumentEndpoint(
  baseUrl: string,
  endpoint: string,
  storagePath: string,
): string {
  return `${baseUrl.replace(/\/+$/, '')}${endpoint}?${new URLSearchParams({ path: storagePath }).toString()}`;
}
