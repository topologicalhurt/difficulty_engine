export async function readBridgeTextDocument(
  fetchImpl: typeof fetch,
  baseUrl: string,
  storagePath: string,
): Promise<string | undefined> {
  const response = await fetchImpl(
    `${baseUrl}/documents/read-text?${new URLSearchParams({ path: storagePath }).toString()}`,
  );
  return response.ok ? await response.text() : undefined;
}

export async function readBridgeByteDocument(
  fetchImpl: typeof fetch,
  baseUrl: string,
  storagePath: string,
): Promise<Uint8Array | undefined> {
  const response = await fetchImpl(
    `${baseUrl}/documents/read-bytes?${new URLSearchParams({ path: storagePath }).toString()}`,
  );
  return response.ok ? new Uint8Array(await response.arrayBuffer()) : undefined;
}
