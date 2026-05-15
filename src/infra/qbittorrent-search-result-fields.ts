import type { SearchResult } from './qbittorrent-types';

function numberFromSearchResult(
  result: SearchResult,
  keys: string[],
): number | null {
  const raw = result as Record<string, unknown>;
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(0, value);
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return Math.max(0, parsed);
    }
  }
  return null;
}

export function seedersFromSearchResult(result: SearchResult): number | null {
  return numberFromSearchResult(result, [
    'nbSeeders',
    'seeders',
    'seeds',
    'num_seeds',
    'numSeeds',
  ]);
}

export function peersFromSearchResult(result: SearchResult): number | null {
  return numberFromSearchResult(result, [
    'nbLeechers',
    'leechers',
    'peers',
    'num_leechs',
    'numLeechs',
  ]);
}
