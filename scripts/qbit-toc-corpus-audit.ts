import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';

import {
  createDefaultQbittorrentConnectionSettings,
  createDefaultSourceSettings,
} from '../src/core/defaults';
import { createEmptyProject, parseProject } from '../src/core/project-file';
import type { PlannerProjectV1, QbittorrentConnectionSettings } from '../src/core/types';
import {
  defaultDocumentAcquisitionPolicy,
  type DocumentAcquisitionPolicy,
} from '../src/infra/document-acquisition';
import { isoTimestamp } from '../src/infra/cache-time';
import { requestBridgeOcrStatus } from '../src/infra/qbittorrent-document-api';
import {
  buildQbittorrentTocCorpusAudit,
  type CorpusAuditLocalDocument,
} from '../src/infra/qbittorrent-toc-corpus-audit';
import { readQbittorrentLiveInventoryFromSettings } from '../src/infra/qbittorrent-live-inventory';

interface CliOptions {
  projectPath?: string;
  scanBackups: boolean;
  write: boolean;
  dataRoot: string;
  backupRoot: string;
  qbitBaseUrl: string;
  qbitCategory: string;
  bridgeBaseUrl: string;
}

const WORKSPACE_ROOT = process.cwd();
const DEFAULT_AUDIT_ROOT = resolve(WORKSPACE_ROOT, 'output', 'audits');
const DOCUMENT_EXTENSIONS = new Set(['.pdf', '.txt', '.text']);
const TEXT_EXTENSIONS = new Set(['.txt', '.text']);

function optionValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function parseArgs(args: string[]): CliOptions {
  const defaults = createDefaultQbittorrentConnectionSettings();
  return {
    projectPath: optionValue(args, '--project'),
    scanBackups: args.includes('--scan-backups'),
    write: args.includes('--write'),
    dataRoot: resolve(
      WORKSPACE_ROOT,
      optionValue(args, '--data-root') ?? defaults.savePath,
    ),
    backupRoot: resolve(
      WORKSPACE_ROOT,
      optionValue(args, '--backup-root') ?? 'output/backups',
    ),
    qbitBaseUrl: optionValue(args, '--qbit-base-url') ?? defaults.baseUrl,
    qbitCategory: optionValue(args, '--qbit-category') ?? defaults.category,
    bridgeBaseUrl: optionValue(args, '--bridge-base-url') ?? defaults.baseUrl,
  };
}

function projectJsonFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return projectJsonFiles(path);
    return entry.isFile() && entry.name.endsWith('.json') ? [path] : [];
  });
}

function readProject(path: string): PlannerProjectV1 {
  return parseProject(readFileSync(path, 'utf8'));
}

function loadProject(options: CliOptions): {
  project: PlannerProjectV1;
  source: string;
  errors: string[];
} {
  const errors: string[] = [];
  if (options.projectPath) {
    const path = resolve(WORKSPACE_ROOT, options.projectPath);
    return { project: readProject(path), source: path, errors };
  }
  if (options.scanBackups) {
    const candidates = projectJsonFiles(options.backupRoot)
      .map((path) => ({ path, mtime: statSync(path).mtimeMs }))
      .sort((left, right) => right.mtime - left.mtime);
    for (const candidate of candidates) {
      try {
        return {
          project: readProject(candidate.path),
          source: candidate.path,
          errors,
        };
      } catch (error) {
        errors.push(
          error instanceof Error
            ? `${candidate.path}: ${error.message}`
            : `Could not parse ${candidate.path}.`,
        );
      }
    }
  }
  return {
    project: createEmptyProject(),
    source: 'empty://project',
    errors: [
      ...errors,
      'No project path was provided and no usable backup project was found.',
    ],
  };
}

function localDocumentFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return localDocumentFiles(path);
    if (!entry.isFile()) return [];
    return DOCUMENT_EXTENSIONS.has(extname(entry.name).toLowerCase())
      ? [path]
      : [];
  });
}

async function readLocalDocuments(
  root: string,
  bridgeBaseUrl: string,
  errors: string[],
): Promise<CorpusAuditLocalDocument[]> {
  return await Promise.all(
    localDocumentFiles(root).map(async (path) => {
      const extension = extname(path).toLowerCase();
      const bytes = readFileSync(path);
      const text = TEXT_EXTENSIONS.has(extension)
        ? bytes.toString('utf8')
        : undefined;
      const ocrStatus =
        extension === '.pdf'
          ? await requestBridgeOcrStatus(fetch, bridgeBaseUrl, path).catch(
              (error) => {
                errors.push(
                  error instanceof Error
                    ? `OCR status unavailable for ${path}: ${error.message}`
                    : `OCR status unavailable for ${path}.`,
                );
                return undefined;
              },
            )
          : undefined;
      return {
        path,
        name: basename(path),
        contentType:
          extension === '.pdf'
            ? 'application/pdf'
            : 'text/plain; charset=utf-8',
        bytes: text ? undefined : new Uint8Array(bytes),
        text,
        ocrStatus,
      };
    }),
  );
}

function acquisitionPolicy(project: PlannerProjectV1): DocumentAcquisitionPolicy {
  return {
    ...defaultDocumentAcquisitionPolicy(),
    enabled: true,
    dataRoot: createDefaultQbittorrentConnectionSettings().savePath,
    contentPreference: project.sourceSettings.contentPreference,
    sourceSettings: project.sourceSettings,
  };
}

function qbitSettings(options: CliOptions): QbittorrentConnectionSettings {
  return {
    ...createDefaultQbittorrentConnectionSettings(),
    enabled: true,
    baseUrl: options.qbitBaseUrl,
    savePath: options.dataRoot,
    category: options.qbitCategory,
  };
}

function timestampForFile(value: string): string {
  return value.replace(/[:.]/g, '-');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const loaded = loadProject(options);
  const errors = [...loaded.errors];
  const sourceSettings =
    loaded.project.sourceSettings ?? createDefaultSourceSettings();
  const policy = {
    ...acquisitionPolicy(loaded.project),
    sourceSettings,
  };
  const inventory = await readQbittorrentLiveInventoryFromSettings(
    qbitSettings(options),
  ).catch((error) => {
    errors.push(
      error instanceof Error
        ? `qBittorrent inventory unavailable: ${error.message}`
        : 'qBittorrent inventory unavailable.',
    );
    return undefined;
  });
  const generatedAt = isoTimestamp();
  const audit = buildQbittorrentTocCorpusAudit({
    project: loaded.project,
    inventory,
    localDocuments: await readLocalDocuments(
      options.dataRoot,
      options.bridgeBaseUrl,
      errors,
    ),
    policy,
    generatedAt,
    errors,
  });
  const payload = {
    projectSource: loaded.source,
    dataRoot: options.dataRoot,
    ...audit,
  };
  const json = JSON.stringify(payload, null, 2);
  console.log(json);
  if (options.write) {
    mkdirSync(DEFAULT_AUDIT_ROOT, { recursive: true });
    const path = join(
      DEFAULT_AUDIT_ROOT,
      `qbit-toc-corpus-audit-${timestampForFile(generatedAt)}.json`,
    );
    writeFileSync(path, json, 'utf8');
    console.error(`Wrote ${relative(WORKSPACE_ROOT, path)}`);
  }
}

await main();
