import { describe, expect, it } from 'vitest';

import {
  cacheEntryIsFresh,
  cacheExpiresAt,
  isoTimestamp,
} from '../../src/infra/cache-time';

describe('cache time helpers', () => {
  it('computes deterministic cache expiry from an injected clock', () => {
    const nowMs = (): number => 1000;

    expect(cacheExpiresAt(250, nowMs)).toBe(1250);
    expect(cacheEntryIsFresh(1250, nowMs)).toBe(true);
    expect(cacheEntryIsFresh(1000, nowMs)).toBe(false);
  });

  it('formats deterministic ISO timestamps from an injected clock', () => {
    const nowMs = (): number => 1000;

    expect(isoTimestamp(nowMs)).toBe('1970-01-01T00:00:01.000Z');
  });
});
