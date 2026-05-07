import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

import { extractDocumentChapters } from '../src/infra/document-text-extractor';

interface TocAuditFixture {
  id: string;
  kind: 'positive' | 'negative';
  bytes?: Uint8Array;
  text?: string;
  contentType: string;
  sourceUrl: string;
  minChapters?: number;
}

interface TocAuditResult {
  id: string;
  kind: 'positive' | 'negative' | 'local';
  passed: boolean;
  strategy: string | null;
  count: number;
  chapters: string[];
  reason: string;
}

const WORKSPACE_ROOT = process.cwd();
const LOCAL_DOCUMENT_ROOT = join(WORKSPACE_ROOT, 'output', 'data', 'documents');
const POSITIVE_TARGET = 0.9;
const BAD_CHAPTER_PATTERN =
  /(?:\bobj\b|^\/|^%|stream|endstream|xref|trailer|\/Width|\/Height)/i;

function textBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

const FIXTURES: TocAuditFixture[] = [
  {
    id: 'split-pdf-outline',
    kind: 'positive',
    contentType: 'application/pdf',
    sourceUrl: 'fixture.pdf',
    minChapters: 3,
    bytes: textBytes(
      [
        '/Title (Contents)',
        '/Title (CHAPTER 3)',
        '/Title (Linear Maps)',
        '/Title (CHAPTER 2)',
        '/Title (Finite-Dimensional Vector Spaces)',
        '/Title (CHAPTER 1)',
        '/Title (Vector Spaces)',
      ].join(' '),
    ),
  },
  {
    id: 'wrapped-explicit-toc',
    kind: 'positive',
    contentType: 'text/plain',
    sourceUrl: 'fixture.txt',
    minChapters: 3,
    text: [
      'Contents',
      'Chapter 1 Introduction to Electronics 1',
      'Chapter 2 Basic Electronic Circuit',
      'Components 253',
      'Appendix A Reference Tables 901',
    ].join('\n'),
  },
  {
    id: 'ocr-like-two-column-toc',
    kind: 'positive',
    contentType: 'text/plain',
    sourceUrl: 'ocr.txt',
    minChapters: 3,
    text: [
      'TABLE OF CONTENTS',
      'Chapter 1 Foundations ........ 1',
      'Chapter 2 Signals and Systems ........ 37',
      'Chapter 3 Filters and Oscillators ........ 92',
    ].join('\n'),
  },
  {
    id: 'pdf-object-noise',
    kind: 'negative',
    contentType: 'application/pdf',
    sourceUrl: 'bad.pdf',
    bytes: textBytes(
      ['%PDF-1.4', '1 0 obj', '/Width 1041', 'stream', '2 0 obj'].join('\n'),
    ),
  },
  {
    id: 'marketing-fragment',
    kind: 'negative',
    contentType: 'text/plain',
    sourceUrl: 'marketing.txt',
    text: 'This new edition includes a chapter on the latest microcontrollers and new sections covering test equipment.',
  },
];

function runFixture(fixture: TocAuditFixture): TocAuditResult {
  const extraction = extractDocumentChapters({
    bytes: fixture.bytes,
    text: fixture.text,
    contentType: fixture.contentType,
    sourceUrl: fixture.sourceUrl,
  });
  const chapters = extraction?.chapters ?? [];
  const hasBadChapter = chapters.some((chapter) =>
    BAD_CHAPTER_PATTERN.test(chapter),
  );
  const passed =
    fixture.kind === 'positive'
      ? chapters.length >= (fixture.minChapters ?? 1) && !hasBadChapter
      : chapters.length === 0;
  return {
    id: fixture.id,
    kind: fixture.kind,
    passed,
    strategy: extraction?.strategy ?? null,
    count: chapters.length,
    chapters: chapters.slice(0, 12),
    reason: passed ? 'ok' : hasBadChapter ? 'bad_chapter' : 'coverage_miss',
  };
}

function localDocumentFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return localDocumentFiles(path);
    if (!entry.isFile()) return [];
    return ['.pdf', '.txt', '.text'].includes(extname(entry.name).toLowerCase())
      ? [path]
      : [];
  });
}

function runLocalDocument(path: string): TocAuditResult {
  const bytes = readFileSync(path);
  const extension = extname(path).toLowerCase();
  const extraction = extractDocumentChapters({
    bytes: new Uint8Array(bytes),
    text: extension === '.pdf' ? undefined : bytes.toString('utf8'),
    contentType: extension === '.pdf' ? 'application/pdf' : 'text/plain',
    sourceUrl: path,
  });
  const chapters = extraction?.chapters ?? [];
  const hasBadChapter = chapters.some((chapter) =>
    BAD_CHAPTER_PATTERN.test(chapter),
  );
  return {
    id: relative(WORKSPACE_ROOT, path),
    kind: 'local',
    passed: !hasBadChapter,
    strategy: extraction?.strategy ?? null,
    count: chapters.length,
    chapters: chapters.slice(0, 8),
    reason: hasBadChapter
      ? 'bad_chapter'
      : chapters.length
        ? 'local_toc_found'
        : 'needs_embedded_text_or_ocr',
  };
}

function printResult(result: TocAuditResult): void {
  console.log(
    JSON.stringify(
      {
        id: result.id,
        kind: result.kind,
        passed: result.passed,
        strategy: result.strategy,
        count: result.count,
        reason: result.reason,
        chapters: result.chapters,
      },
      null,
      2,
    ),
  );
}

function main(): void {
  const fixtureResults = FIXTURES.map(runFixture);
  fixtureResults.forEach(printResult);
  const positiveResults = fixtureResults.filter(
    (result) => result.kind === 'positive',
  );
  const fillRate =
    positiveResults.filter((result) => result.passed).length /
    positiveResults.length;
  const localResults = localDocumentFiles(LOCAL_DOCUMENT_ROOT)
    .filter((path) => statSync(path).isFile())
    .map(runLocalDocument);
  localResults.forEach(printResult);
  const falsePositiveCount = [...fixtureResults, ...localResults].filter(
    (result) => !result.passed && result.reason === 'bad_chapter',
  ).length;
  console.log(
    JSON.stringify(
      {
        fixtureFillRate: fillRate,
        localDocuments: localResults.length,
        localTocsFound: localResults.filter((result) => result.count > 0)
          .length,
        falsePositiveCount,
      },
      null,
      2,
    ),
  );
  if (fillRate < POSITIVE_TARGET || falsePositiveCount > 0) {
    process.exitCode = 1;
  }
}

main();
