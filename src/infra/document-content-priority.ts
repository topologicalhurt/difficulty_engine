import type { SourceContentKind } from '../core/types';

export type RankedDocumentContentKind = SourceContentKind | 'unknown';

const FALLBACK_CONTENT_KIND_PRIORITY: Record<RankedDocumentContentKind, number> =
  {
    text: 0,
    epub: 1,
    ocr_text: 2,
    pdf: 3,
    unknown: 4,
  };

export function contentKindPriority(
  kind: RankedDocumentContentKind,
  preference: SourceContentKind[],
): number {
  const preferredOrder = [...preference, 'unknown'];
  const preferredIndex = preferredOrder.indexOf(kind);
  return preferredIndex >= 0
    ? preferredIndex
    : FALLBACK_CONTENT_KIND_PRIORITY[kind];
}

export function contentKindPriorityForPreference(
  preference: SourceContentKind[],
): (kind: RankedDocumentContentKind) => number {
  return (kind) => contentKindPriority(kind, preference);
}
