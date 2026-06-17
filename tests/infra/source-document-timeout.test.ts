import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDefaultSourceSettings, EXAMPLE_BOOK } from '../../src/core/defaults';
import { sourceDocumentCandidate } from '../../src/infra/source-document-candidates';

describe('direct document download timeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('aborts and degrades to null when the source never responds', async () => {
    vi.useFakeTimers();
    const sourceSettings = createDefaultSourceSettings();
    sourceSettings.documentSources.directUrl = true;

    // A fetch that never resolves until its signal is aborted.
    const fetchImpl = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal ?? undefined;
        if (signal?.aborted) {
          reject(new DOMException('aborted', 'AbortError'));
          return;
        }
        signal?.addEventListener(
          'abort',
          () => reject(new DOMException('aborted', 'AbortError')),
          { once: true },
        );
      })) as unknown as typeof fetch;

    const promise = sourceDocumentCandidate({
      book: { ...EXAMPLE_BOOK, sourcePath: 'https://example.test/book.pdf' },
      fetchImpl,
      sourceSettings,
    });

    // Advance past the internal timeout; the fetch is aborted and the source
    // candidate resolves to null rather than hanging the acquisition.
    await vi.advanceTimersByTimeAsync(31_000);
    await expect(promise).resolves.toBeNull();
  });
});
