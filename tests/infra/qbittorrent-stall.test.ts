import { describe, expect, it } from 'vitest';

import { statusAfterGrace } from '../../src/infra/qbittorrent-acquisition';

const GRACE_MS = 10 * 60 * 1000;
const createdAt = '2026-01-01T00:00:00.000Z';
const afterGrace = Date.parse(createdAt) + GRACE_MS + 1000;

describe('qBittorrent stall detection', () => {
  it('marks a partially-downloaded torrent with no live activity as stalled', () => {
    const status = statusAfterGrace(
      'downloading',
      {
        seeders: 0,
        peers: 0,
        progress: 0.4,
        availability: 0,
        downloadSpeedBytesPerSecond: 0,
        state: 'stalledDL',
      },
      createdAt,
      afterGrace,
    );
    expect(status).toBe('stalled');
  });

  it('does not stall a torrent that is still making progress', () => {
    const status = statusAfterGrace(
      'downloading',
      {
        seeders: 3,
        peers: 1,
        progress: 0.4,
        availability: 2,
        downloadSpeedBytesPerSecond: 50_000,
        state: 'downloading',
      },
      createdAt,
      afterGrace,
    );
    expect(status).toBe('downloading');
  });

  it('does not stall a completed torrent', () => {
    const status = statusAfterGrace(
      'downloading',
      {
        seeders: 0,
        peers: 0,
        progress: 1,
        availability: 0,
        downloadSpeedBytesPerSecond: 0,
        state: 'stalledUP',
      },
      createdAt,
      afterGrace,
    );
    expect(status).toBe('downloading');
  });

  it('respects the stall grace window', () => {
    const status = statusAfterGrace(
      'downloading',
      {
        seeders: 0,
        peers: 0,
        progress: 0.4,
        availability: 0,
        downloadSpeedBytesPerSecond: 0,
        state: 'stalledDL',
      },
      createdAt,
      Date.parse(createdAt) + 1000,
    );
    expect(status).toBe('downloading');
  });
});
