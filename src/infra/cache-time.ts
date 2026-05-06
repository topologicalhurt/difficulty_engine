export type NowMs = () => number;

export const systemNowMs: NowMs = () => Date.now();

export function cacheEntryIsFresh(expiresAt: number, nowMs: NowMs): boolean {
  return expiresAt > nowMs();
}

export function cacheExpiresAt(cacheTtlMs: number, nowMs: NowMs): number {
  return nowMs() + cacheTtlMs;
}

export function isoTimestamp(nowMs: NowMs = systemNowMs): string {
  return new Date(nowMs()).toISOString();
}
