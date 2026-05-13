import { describe, expect, it } from 'vitest';

import { createStoreRequestSequencer } from '../../src/app/store-request-sequencer';

describe('store request sequencer', () => {
  it('marks only the newest async request as current', () => {
    const requests = createStoreRequestSequencer();
    const first = requests.begin();
    const second = requests.begin();

    expect(requests.isCurrent(first)).toBe(false);
    expect(requests.isCurrent(second)).toBe(true);
  });

  it('invalidates pending requests without starting a replacement', () => {
    const requests = createStoreRequestSequencer();
    const pending = requests.begin();
    requests.invalidate();

    expect(requests.isCurrent(pending)).toBe(false);
  });
});
