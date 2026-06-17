import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchWithTimeout,
  readLimitedResponseBytes,
} from '../../src/infra/bridge-fetch';

afterEach(() => {
  vi.useRealTimers();
});

describe('fetchWithTimeout', () => {
  it('aborts a request that never responds once the timeout elapses', async () => {
    vi.useFakeTimers();
    const fetchImpl = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('aborted', 'AbortError')),
          { once: true },
        );
      })) as unknown as typeof fetch;

    const promise = fetchWithTimeout(fetchImpl, 'http://127.0.0.1/x', {}, 5_000);
    // Attach the rejection handler before advancing timers so the abort-driven
    // rejection is never momentarily unhandled.
    const assertion = expect(promise).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(6_000);
    await assertion;
  });

  it('propagates a pre-aborted parent signal to the request', async () => {
    const parent = new AbortController();
    parent.abort();
    const fetchImpl = ((_url: string, init?: RequestInit) =>
      init?.signal?.aborted
        ? Promise.reject(new DOMException('aborted', 'AbortError'))
        : Promise.resolve(new Response('ok'))) as unknown as typeof fetch;

    await expect(
      fetchWithTimeout(fetchImpl, 'http://127.0.0.1/x', {}, 5_000, parent.signal),
    ).rejects.toThrow();
  });
});

describe('readLimitedResponseBytes', () => {
  it('refuses a body whose Content-Length exceeds the cap', async () => {
    const response = new Response('x', {
      headers: { 'content-length': '5000' },
    });
    expect(await readLimitedResponseBytes(response, 1024)).toBeNull();
  });

  it('returns the bytes when within the cap', async () => {
    const response = new Response(new Uint8Array([1, 2, 3, 4]));
    const bytes = await readLimitedResponseBytes(response, 1024);
    expect(bytes && Array.from(bytes)).toEqual([1, 2, 3, 4]);
  });
});
