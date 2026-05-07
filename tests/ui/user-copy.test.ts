import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const USER_FACING_COPY_FILES = [
  'src/ui/constraints-view.ts',
  'src/ui/graphs-view.ts',
  'src/ui/info-view.ts',
  'src/content/info/readme.ts',
  'src/app/selectors/shell.ts',
];

const FORBIDDEN_PHRASES = [
  'control surface',
  'canonical engine',
  'canonical snapshot',
  'Graph display',
  'separate analysis path',
];

describe('user-facing copy', () => {
  it('avoids implementation-facing tab descriptions', () => {
    const copy = USER_FACING_COPY_FILES.map((path) =>
      readFileSync(join(process.cwd(), path), 'utf8'),
    ).join('\n');

    FORBIDDEN_PHRASES.forEach((phrase) => {
      expect(copy).not.toContain(phrase);
    });
  });
});
