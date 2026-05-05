import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

function sourceFiles(dir = SRC): string[] {
  return readdirSync(dir)
    .flatMap((entry) => {
      const path = join(dir, entry);
      const stat = statSync(path);
      if (stat.isDirectory()) return sourceFiles(path);
      return path.endsWith('.ts') ? [path] : [];
    })
    .sort();
}

function repositoryFiles(dir = ROOT): string[] {
  const ignored = new Set([
    '.git',
    'node_modules',
    'coverage',
    'test-results',
    'data',
  ]);
  return readdirSync(dir)
    .flatMap((entry) => {
      if (dir === ROOT && ignored.has(entry)) return [];
      const path = join(dir, entry);
      const stat = statSync(path);
      if (stat.isDirectory()) return repositoryFiles(path);
      return [path];
    })
    .sort();
}

function lineCount(path: string): number {
  return readFileSync(path, 'utf8').split('\n').length;
}

function relativeSourcePath(path: string): string {
  return relative(ROOT, path);
}

describe('source architecture guardrails', () => {
  it('keeps removable local artifacts out of the repository tree', () => {
    const junkArtifactPattern =
      /(^|\/)(?:\.DS_Store|\.eslintcache|\.tsbuildinfo)$|(?:\.bak|\.backup|\.old|\.orig|\.rej|\.tmp|~)$/;
    const violations = repositoryFiles()
      .map(relativeSourcePath)
      .filter((path) => junkArtifactPattern.test(path.replace(/\\/g, '/')));

    expect(violations).toEqual([]);
  });

  it('keeps source modules below the hard audit size limit', () => {
    const oversized = sourceFiles()
      .map((path) => ({ path, lines: lineCount(path) }))
      .filter((file) => file.lines > 500);

    expect(
      oversized.map(
        (file) => `${relativeSourcePath(file.path)} (${file.lines})`,
      ),
    ).toEqual([]);
  });

  it('keeps extracted orchestration files small enough to remain orchestration-only', () => {
    const modules = new Map([
      ['src/ui/diagnostics-graphs.ts', 80],
      ['src/ui/plan-view.ts', 100],
      ['src/core/project-file.ts', 120],
      ['src/core/relations.ts', 320],
    ]);

    const violations = Array.from(modules.entries())
      .map(([path, maxLines]) => ({
        path,
        maxLines,
        lines: lineCount(join(ROOT, path)),
      }))
      .filter((module) => module.lines > module.maxLines);

    expect(violations).toEqual([]);
  });

  it('keeps accidental re-export adapters out of source modules', () => {
    const allowed = new Set([
      'src/index.ts',
      'src/app/wiring/contracts.ts',
      'src/core/defaults.ts',
      'src/core/types/domain.ts',
      'src/core/internal-types.ts',
      'src/core/types.ts',
      'src/core/types/snapshot.ts',
    ]);
    const violations = sourceFiles()
      .filter((path) => !allowed.has(relativeSourcePath(path)))
      .filter((path) =>
        /^\s*export\s+(?:type\s+)?(?:\*|\{[^}]+\})\s+from\s+['"]/m.test(
          readFileSync(path, 'utf8'),
        ),
      )
      .map(relativeSourcePath);

    expect(violations).toEqual([]);
  });

  it('keeps core, infra, and app layer imports one-directional', () => {
    const importPattern =
      /^\s*import(?:\s+type)?[^'"]*from\s+['"](?<specifier>\.{1,2}\/[^'"]+)['"]/gm;
    const violations: string[] = [];
    for (const path of sourceFiles()) {
      const relativePath = relativeSourcePath(path);
      const text = readFileSync(path, 'utf8');
      for (const match of text.matchAll(importPattern)) {
        const specifier = match.groups?.specifier;
        if (!specifier) continue;
        const target = join(dirname(path), specifier).replace(/\\/g, '/');
        const resolved = sourceFiles().find(
          (file) => file === `${target}.ts` || file === `${target}/index.ts`,
        );
        if (!resolved) continue;
        const relativeTarget = relativeSourcePath(resolved);
        if (
          relativePath.startsWith('src/core/') &&
          /src\/(?:app|ui|infra)\//.test(relativeTarget)
        ) {
          violations.push(`${relativePath} -> ${relativeTarget}`);
        }
        if (
          relativePath.startsWith('src/infra/') &&
          /src\/(?:app|ui)\//.test(relativeTarget)
        ) {
          violations.push(`${relativePath} -> ${relativeTarget}`);
        }
        if (
          relativePath.startsWith('src/app/') &&
          relativeTarget.startsWith('src/ui/') &&
          !(
            relativePath === 'src/app/mount.ts' &&
            relativeTarget === 'src/ui/app-shell.ts'
          )
        ) {
          violations.push(`${relativePath} -> ${relativeTarget}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('keeps shared calendar constants centralized', () => {
    const declarations = sourceFiles()
      .filter((path) => !path.endsWith('src/core/date-constants.ts'))
      .filter((path) =>
        /\bconst\s+DAYS_PER_WEEK\s*=/.test(readFileSync(path, 'utf8')),
      )
      .map(relativeSourcePath);

    expect(declarations).toEqual([]);
  });

  it('keeps selector date labels behind date-label helpers', () => {
    const allowed = new Set(['src/app/selectors/date-labels.ts']);
    const violations = sourceFiles()
      .map(relativeSourcePath)
      .filter(
        (path) => path.startsWith('src/app/selectors/') && !allowed.has(path),
      )
      .filter((path) =>
        /\btoLocaleDateString\s*\(/.test(
          readFileSync(join(ROOT, path), 'utf8'),
        ),
      );

    expect(violations).toEqual([]);
  });

  it('keeps select controls behind the shared selectInput primitive', () => {
    const allowed = new Set(['src/ui/form-controls.ts']);
    const adHocSelectPattern =
      /(?:document\.createElement\(['"](?:select|option)['"]\)|\bel\(['"](?:select|option)['"])/;
    const violations = sourceFiles()
      .map(relativeSourcePath)
      .filter((path) => path.startsWith('src/ui/') && !allowed.has(path))
      .filter((path) =>
        adHocSelectPattern.test(readFileSync(join(ROOT, path), 'utf8')),
      );

    expect(violations).toEqual([]);
  });

  it('keeps text, numeric, file, and checkbox inputs behind shared control primitives', () => {
    const allowed = new Set([
      'src/ui/form-controls.ts',
      'src/ui/constraint-field.ts',
    ]);
    const adHocInputPattern =
      /(?:document\.createElement\(['"](?:input|textarea)['"]\)|\bel\(['"](?:input|textarea)['"])/;
    const violations = sourceFiles()
      .map(relativeSourcePath)
      .filter((path) => path.startsWith('src/ui/') && !allowed.has(path))
      .filter((path) =>
        adHocInputPattern.test(readFileSync(join(ROOT, path), 'utf8')),
      );

    expect(violations).toEqual([]);
  });

  it('keeps UI percentage formatting behind formatPercent', () => {
    const allowed = new Set(['src/ui/format.ts']);
    const localPercentPattern = /\$\{\s*Math\.round\([^}]*\*\s*100\)\s*\}%/;
    const violations = sourceFiles()
      .map(relativeSourcePath)
      .filter((path) => path.startsWith('src/ui/') && !allowed.has(path))
      .filter((path) =>
        localPercentPattern.test(readFileSync(join(ROOT, path), 'utf8')),
      );

    expect(violations).toEqual([]);
  });

  it('keeps CSS percentage strings behind formatCssPercent', () => {
    const allowed = new Set(['src/ui/format.ts']);
    const localCssPercentPattern =
      /style\.(?:width|height|left)\s*=.*\*\s*100.*%/;
    const violations = sourceFiles()
      .map(relativeSourcePath)
      .filter((path) => path.startsWith('src/ui/') && !allowed.has(path))
      .filter((path) =>
        localCssPercentPattern.test(readFileSync(join(ROOT, path), 'utf8')),
      );

    expect(violations).toEqual([]);
  });

  it('keeps infra source enablement checks behind source-settings policy helpers', () => {
    const directSourceFlagPattern =
      /sourceSettings\??\.(?:metadataSources|documentSources)\.[a-zA-Z]+|sourceSettings\??\.qbittorrent\.(?:userProvidedTorrents|searchPlugins)/;
    const violations = sourceFiles()
      .map(relativeSourcePath)
      .filter((path) => path.startsWith('src/infra/'))
      .filter((path) =>
        directSourceFlagPattern.test(readFileSync(join(ROOT, path), 'utf8')),
      );

    expect(violations).toEqual([]);
  });

  it('keeps infra cache expiry behind cache-time helpers', () => {
    const allowed = new Set(['src/infra/cache-time.ts']);
    const violations = sourceFiles()
      .map(relativeSourcePath)
      .filter((path) => path.startsWith('src/infra/') && !allowed.has(path))
      .filter((path) =>
        /\bDate\.now\s*\(/.test(readFileSync(join(ROOT, path), 'utf8')),
      );

    expect(violations).toEqual([]);
  });

  it('ships a manual change guide and change safety report', () => {
    const guide = join(ROOT, 'CHANGE_GUIDE.md');
    expect(existsSync(guide)).toBe(true);
    expect(readFileSync(guide, 'utf8')).toContain('Default Change Loop');
    expect(readFileSync(guide, 'utf8')).toContain('Canonical Patterns');
    expect(existsSync(join(ROOT, 'scripts', 'change_safety_report.py'))).toBe(
      true,
    );
  });

  it('ships the architecture report script used by design reviews', () => {
    expect(existsSync(join(ROOT, 'scripts', 'architecture_report.py'))).toBe(
      true,
    );
  });
});
