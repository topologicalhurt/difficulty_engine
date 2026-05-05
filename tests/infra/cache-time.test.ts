import { describe, expect, it } from 'vitest';

import { cacheEntryIsFresh, cacheExpiresAt } from '../../src/infra/cache-time';

describe('cache time helpers', () => {
  it('computes deterministic cache expiry from an injected clock', () => {
    const nowMs = (): number => 1000;

    expect(cacheExpiresAt(250, nowMs)).toBe(1250);
    expect(cacheEntryIsFresh(1250, nowMs)).toBe(true);
    expect(cacheEntryIsFresh(1000, nowMs)).toBe(false);
  });
});
