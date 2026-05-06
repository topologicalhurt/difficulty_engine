export type OpenLibraryKeyKind = 'work' | 'edition' | 'any';

const OPEN_LIBRARY_PATH_PATTERN =
  /^(?:https?:\/\/openlibrary\.org)?\/?(works|books)\/(OL\d+[MW])$/i;
const OPEN_LIBRARY_BARE_PATTERN = /^(OL\d+[MW])$/i;

export function normalizeOpenLibraryKey(
  value: string | null | undefined,
  kind: OpenLibraryKeyKind = 'any',
): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const pathMatch = raw.match(OPEN_LIBRARY_PATH_PATTERN);
  const bareMatch = raw.match(OPEN_LIBRARY_BARE_PATTERN);
  const type = pathMatch?.[1]?.toLowerCase();
  const id = (pathMatch?.[2] ?? bareMatch?.[1] ?? '').toUpperCase();
  if (!id) return null;

  const inferredKind = id.endsWith('W')
    ? 'work'
    : id.endsWith('M')
      ? 'edition'
      : null;
  if (!inferredKind) return null;
  if (kind !== 'any' && inferredKind !== kind) return null;
  if (type === 'works' && inferredKind !== 'work') return null;
  if (type === 'books' && inferredKind !== 'edition') return null;

  return inferredKind === 'work' ? `/works/${id}` : `/books/${id}`;
}
