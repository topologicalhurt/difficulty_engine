import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, resolve } from 'node:path';

import {
  createDefaultQbittorrentConnectionSettings,
  createDefaultSourceSettings,
  EXAMPLE_BOOK,
} from '../src/core/defaults';
import { parseProject } from '../src/core/project-file';
import type {
  BookDocumentBlockedCandidateOption,
  BookDocumentCandidateOption,
  BookRecord,
  QbittorrentConnectionSettings,
} from '../src/core/types';
import { defaultDocumentAcquisitionPolicy } from '../src/infra/document-acquisition';
import { isoTimestamp } from '../src/infra/cache-time';
import { createQBittorrentIntegrationService } from '../src/infra/qbittorrent-provider';
import { qbittorrentSearchQueries } from '../src/infra/qbittorrent-search-queries';

const WORKSPACE_ROOT = process.cwd();
const DEFAULT_AUDIT_ROOT = resolve(WORKSPACE_ROOT, 'output', 'audits');

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
  {
    title: 'Kline M. Calculus. An Intuitive and Physical Approach 2ed 1998',
    short: 'Calculus',
    authors: ['Morris Kline'],
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

function projectJsonFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return projectJsonFiles(path);
    return entry.isFile() && entry.name.endsWith('.json') ? [path] : [];
  });
}

function latestBackupProjectPath(args: string[]): string | undefined {
  const backupRoot = resolve(
    WORKSPACE_ROOT,
    optionValue(args, '--backup-root') ?? 'output/backups',
  );
  return projectJsonFiles(backupRoot)
    .map((path) => ({ path, mtime: statSync(path).mtimeMs }))
    .sort((left, right) => right.mtime - left.mtime)[0]?.path;
}

function projectBooksFromPath(path: string): BookRecord[] {
  const project = parseProject(readFileSync(path, 'utf8'));
  return Object.values(project.library.books);
}

function booksForAudit(args: string[]): { books: BookRecord[]; source: string } {
  const projectPath = optionValue(args, '--project');
  if (projectPath) {
    const path = resolve(WORKSPACE_ROOT, projectPath);
    return { books: projectBooksFromPath(path), source: path };
  }
  if (args.includes('--scan-backups')) {
    const path = latestBackupProjectPath(args);
    if (path) return { books: projectBooksFromPath(path), source: path };
  }
  const title = optionValue(args, '--title');
  if (!title) {
    return {
      source: 'fixture://default',
      books: fixtures.map((fixture, index) => ({
        ...EXAMPLE_BOOK,
        ...fixture,
        id: `qbit-audit-${index + 1}`,
        sourcePath: null,
      })),
    };
  }
  return {
    source: 'fixture://custom',
    books: [
      {
        ...EXAMPLE_BOOK,
        id: 'qbit-audit-custom',
        title,
        short: optionValue(args, '--short') ?? title,
        authors: optionValues(args, '--author'),
        isbn: optionValue(args, '--isbn') ?? null,
        sourcePath: null,
      },
    ],
  };
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
  const auditBooks = booksForAudit(args);
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
  const generatedAt = isoTimestamp();
  const rows: Array<{
    bookId: string;
    title: string;
    acceptedCount: number;
    blockedCount: number;
    rawCount: number;
    searchAttempts: unknown[];
    candidates: string[];
    blocked: string[];
  }> = [];
  console.log(
    JSON.stringify(
      {
        generatedAt,
        mode: 'live-dry-run',
        projectSource: auditBooks.source,
        bookCount: auditBooks.books.length,
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
  for (const book of auditBooks.books) {
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
    rows.push({
      bookId: book.id,
      title: book.title,
      acceptedCount: result.candidates.length,
      blockedCount: result.blockedCandidates.length,
      rawCount: result.searchAttempts.reduce(
        (sum, attempt) => sum + attempt.resultCount,
        0,
      ),
      searchAttempts: result.searchAttempts,
      candidates: result.candidates.slice(0, 10).map(summarizeCandidate),
      blocked: result.blockedCandidates.slice(0, 10).map(summarizeBlocked),
    });
  }
  if (args.includes('--write')) {
    mkdirSync(DEFAULT_AUDIT_ROOT, { recursive: true });
    const path = join(
      DEFAULT_AUDIT_ROOT,
      `qbit-live-search-dry-run-${generatedAt.replace(/[:.]/g, '-')}.json`,
    );
    writeFileSync(
      path,
      JSON.stringify(
        {
          generatedAt,
          mode: 'live-dry-run',
          projectSource: auditBooks.source,
          rows,
        },
        null,
        2,
      ),
      'utf8',
    );
    console.error(`Wrote ${relative(WORKSPACE_ROOT, path)}`);
  }
}

const args = process.argv.slice(2);
if (args.includes('--live')) {
  await liveAudit(args);
} else {
  for (const book of booksForAudit(args).books) printQueries(book);
}
