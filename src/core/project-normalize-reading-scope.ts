import {
  createDefaultReadingScopeSettings,
} from './defaults';
import type {
  BookReadingScope,
  BookReadingScopeMode,
  ReadingScopeSettings,
  ReadingSectionKind,
} from './types';
import {
  normalizeString,
  normalizeStringArray,
} from './project-normalize-primitives';

const BOOK_SCOPE_MODES = new Set<BookReadingScopeMode>([
  'project',
  'include_all',
  'skip_non_core',
]);

const SECTION_KINDS = new Set<ReadingSectionKind>([
  'core',
  'front_matter',
  'toc',
  'appendix',
  'bibliography_index',
  'solutions_reference',
  'redundant_duplicate',
  'unknown',
]);

function normalizeMode(value: unknown): BookReadingScopeMode {
  const normalized = normalizeString(value) as BookReadingScopeMode;
  return BOOK_SCOPE_MODES.has(normalized) ? normalized : 'project';
}

function normalizeKind(value: unknown): ReadingSectionKind | null {
  const normalized = normalizeString(value) as ReadingSectionKind;
  return SECTION_KINDS.has(normalized) ? normalized : null;
}

export function normalizeBookReadingScope(input: unknown): BookReadingScope {
  const raw =
    input && typeof input === 'object'
      ? (input as Record<string, unknown>)
      : {};
  return {
    mode: normalizeMode(raw.mode),
    skippedSectionTitles: normalizeStringArray(raw.skippedSectionTitles),
    includedSectionTitles: normalizeStringArray(raw.includedSectionTitles),
  };
}

export function normalizeReadingScopeSettings(
  input: unknown,
): ReadingScopeSettings {
  const defaults = createDefaultReadingScopeSettings();
  const raw =
    input && typeof input === 'object'
      ? (input as Record<string, unknown>)
      : {};
  const defaultMode =
    normalizeString(raw.defaultMode) === 'include_all'
      ? 'include_all'
      : defaults.defaultMode;
  const skipKinds = Array.isArray(raw.skipKinds)
    ? raw.skipKinds
        .map(normalizeKind)
        .filter((kind): kind is ReadingSectionKind => Boolean(kind))
    : defaults.skipKinds;
  return {
    defaultMode,
    skipKinds: skipKinds.length
      ? Array.from(new Set(skipKinds))
      : defaults.skipKinds,
  };
}
