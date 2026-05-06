import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLocalIntegrationSettings } from '../../src/infra/local-integration-settings';

describe('local integration settings', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not persist qBittorrent passwords in browser storage', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    });
    const settings = createLocalIntegrationSettings('difficulty-engine-test');

    settings.saveQbittorrentConnection({
      enabled: true,
      baseUrl: 'http://127.0.0.1:8787',
      username: 'connor',
      password: 'local-secret',
      savePath: 'output/data/documents',
      category: 'difficulty-engine',
      timeoutMs: 10000,
    });

    const raw = values.get('difficulty-engine-test') ?? '';
    expect(raw).not.toContain('local-secret');
    expect(settings.loadQbittorrentConnection()?.password).toBe('');
  });
});
