import {
  createDefaultQbittorrentConnectionSettings,
  createDefaultSourceSettings,
  EXAMPLE_BOOK,
} from '../src/core/defaults';
import type {
  BookDocumentBlockedCandidateOption,
  BookDocumentCandidateOption,
  BookRecord,
  QbittorrentConnectionSettings,
} from '../src/core/types';
import { defaultDocumentAcquisitionPolicy } from '../src/infra/document-acquisition';
import { isoTimestamp } from '../src/infra/cache-time';
import { createQBittorrentIntegrationService } from '../src/infra/qbittorrent-provider';
import { qbittorrentSearchQueries } from '../src/infra/qbittorrent-search';

const fixtures = [
  {
    title: 'Discrete-time Signal Processing, 2nd, Second Edition',
    short: 'Discrete-time Signal Processing',
    authors: ['Ronald W. Oppenheim Alan V. / Schafer'],
    isbn: null,
  },
  {
    title: 'Practical Electronics for Inventors, 4th Edition',
    short: 'Practical Electronics',
    authors: ['Paul Scherz'],
    isbn: null,
  },
];

function optionValues(args: string[], name: string): string[] {
  return args.flatMap((arg, index) =>
    arg === name && args[index + 1] ? [String(args[index + 1])] : [],
  );
}

function optionValue(args: string[], name: string): string | undefined {
  return optionValues(args, name)[0];
}

function numberOption(args: string[], name: string, fallback: number): number {
  const parsed = Number(optionValue(args, name));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function boolOption(args: string[], name: string, fallback: boolean): boolean {
  const value = optionValue(args, name);
  if (value == null) return fallback;
  return !/^(?:0|false|no)$/i.test(value);
}

function fixtureBooks(args: string[]): BookRecord[] {
  const title = optionValue(args, '--title');
  if (!title) {
    return fixtures.map((fixture, index) => ({
      ...EXAMPLE_BOOK,
      ...fixture,
      id: `qbit-audit-${index + 1}`,
      sourcePath: null,
    }));
  }
  return [
    {
      ...EXAMPLE_BOOK,
      id: 'qbit-audit-custom',
      title,
      short: optionValue(args, '--short') ?? title,
      authors: optionValues(args, '--author'),
      isbn: optionValue(args, '--isbn') ?? null,
      sourcePath: null,
    },
  ];
}

function printQueries(book: BookRecord): void {
  const queries = qbittorrentSearchQueries({
    book,
    policy: { ...defaultDocumentAcquisitionPolicy(), enabled: true },
  });
  console.log(`\n${book.title}`);
  for (const query of queries) {
    console.log(`- ${query.intent}: ${query.pattern}`);
  }
}

function summarizeCandidate(candidate: BookDocumentCandidateOption): string {
  return [
    candidate.title,
    `${candidate.seeders ?? 0} seeders`,
    candidate.matchScore == null
      ? null
      : `match ${Math.round(candidate.matchScore * 100)}%`,
    candidate.qualityScore == null
      ? null
      : `quality ${Math.round(candidate.qualityScore * 100)}%`,
    candidate.qualityReason,
    candidate.sourceUrl,
  ]
    .filter(Boolean)
    .join(' · ');
}

function summarizeBlocked(
  candidate: BookDocumentBlockedCandidateOption,
): string {
  return [
    candidate.title,
    `${candidate.seeders ?? 0} seeders`,
    candidate.matchScore == null
      ? null
      : `match ${Math.round(candidate.matchScore * 100)}%`,
    `blocked: ${candidate.blockedReasons.join(', ')}`,
    candidate.retryableAsUserOwned ? 'manual confirmable' : null,
    candidate.sourceUrl,
  ]
    .filter(Boolean)
    .join(' · ');
}

async function liveAudit(args: string[]): Promise<void> {
  const service = createQBittorrentIntegrationService();
  const defaults = createDefaultQbittorrentConnectionSettings();
  const settings: QbittorrentConnectionSettings = {
    ...defaults,
    enabled: true,
    baseUrl: optionValue(args, '--base-url') ?? defaults.baseUrl,
    category: optionValue(args, '--category') ?? defaults.category,
    savePath: optionValue(args, '--data-root') ?? defaults.savePath,
  };
  const sourceSettings = createDefaultSourceSettings();
  sourceSettings.documentSources.qbittorrent = true;
  sourceSettings.qbittorrent.searchPlugins = true;
  sourceSettings.qbittorrent.maxResults = numberOption(
    args,
    '--max-results',
    sourceSettings.qbittorrent.maxResults,
  );
  sourceSettings.qbittorrent.categories = [
    optionValue(args, '--search-category') ?? 'all',
  ];
  sourceSettings.qbittorrent.requireKnownAccessBasis = boolOption(
    args,
    '--require-known-access-basis',
    sourceSettings.qbittorrent.requireKnownAccessBasis,
  );
  const plugins = await service.listPlugins(settings);
  const enabledPlugins = plugins.filter((plugin) => plugin.enabled);
  if (args.includes('--allow-all-plugins')) {
    sourceSettings.qbittorrent.allowedPlugins = enabledPlugins.map(
      (plugin) => plugin.name,
    );
    sourceSettings.qbittorrent.allowedSites = [];
  } else {
    const allowPlugins = optionValues(args, '--plugin');
    const allowSites = optionValues(args, '--site');
    if (allowPlugins.length)
      sourceSettings.qbittorrent.allowedPlugins = allowPlugins;
    if (allowSites.length) sourceSettings.qbittorrent.allowedSites = allowSites;
  }
  console.log(
    JSON.stringify(
      {
        generatedAt: isoTimestamp(),
        mode: 'live-dry-run',
        pluginsSearched: sourceSettings.qbittorrent.allowedPlugins.length
          ? sourceSettings.qbittorrent.allowedPlugins
          : sourceSettings.qbittorrent.allowedSites,
        maxResults: sourceSettings.qbittorrent.maxResults,
        requireKnownAccessBasis:
          sourceSettings.qbittorrent.requireKnownAccessBasis,
      },
      null,
      2,
    ),
  );
  for (const book of fixtureBooks(args)) {
    printQueries(book);
    const result = await service.findDocumentCandidates(settings, {
      book,
      sourceSettings,
      qbittorrentConnection: settings,
    });
    console.log(
      `Accepted ${result.candidates.length}, blocked ${result.blockedCandidates.length}, attempts ${result.searchAttempts.length}`,
    );
    result.searchAttempts.slice(0, 12).forEach((attempt) => {
      console.log(
        `  trace ${attempt.intent}: "${attempt.pattern}" via ${attempt.plugins} -> ${attempt.resultCount} raw, ${attempt.acceptedCount} accepted, ${attempt.blockedCount} blocked, ${attempt.status ?? 'unknown'}`,
      );
    });
    result.candidates.slice(0, 10).forEach((candidate, index) => {
      console.log(`  candidate ${index + 1}: ${summarizeCandidate(candidate)}`);
    });
    result.blockedCandidates.slice(0, 10).forEach((candidate, index) => {
      console.log(`  blocked ${index + 1}: ${summarizeBlocked(candidate)}`);
    });
  }
}

const args = process.argv.slice(2);
if (args.includes('--live')) {
  await liveAudit(args);
} else {
  for (const book of fixtureBooks(args)) printQueries(book);
}
