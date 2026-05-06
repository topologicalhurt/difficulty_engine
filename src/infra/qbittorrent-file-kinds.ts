import type { DocumentCandidate } from './document-acquisition';

export const TEXT_MIME = 'text/plain';
export const PDF_MIME = 'application/pdf';
export const EPUB_MIME = 'application/epub+zip';
export const OCR_TEXT_EXT_PATTERN = /(?:_djvu\.txt|ocr\.txt)(?:$|[?#])/i;
export const TEXT_EXT_PATTERN = /(?:\.txt|\.text)(?:$|[?#])/i;
export const EPUB_EXT_PATTERN = /\.epub(?:$|[?#])/i;
export const PDF_EXT_PATTERN = /\.pdf(?:$|[?#])/i;

export function contentKindFromUrl(
  url: string,
): DocumentCandidate['contentKind'] {
  if (OCR_TEXT_EXT_PATTERN.test(url)) return 'ocr_text';
  if (TEXT_EXT_PATTERN.test(url)) return 'text';
  if (EPUB_EXT_PATTERN.test(url)) return 'epub';
  if (PDF_EXT_PATTERN.test(url)) return 'pdf';
  return 'unknown';
}

export function contentTypeFromPath(path: string): string {
  if (TEXT_EXT_PATTERN.test(path) || OCR_TEXT_EXT_PATTERN.test(path))
    return TEXT_MIME;
  if (EPUB_EXT_PATTERN.test(path)) return EPUB_MIME;
  if (PDF_EXT_PATTERN.test(path)) return PDF_MIME;
  return 'application/octet-stream';
}

export function isPdfDocument(
  pathOrUrl: string | null | undefined,
  contentType?: string | null,
): boolean {
  return Boolean(
    contentType?.toLowerCase().includes('pdf') ||
    PDF_EXT_PATTERN.test(pathOrUrl ?? ''),
  );
}

export function sourceContentKindFromPath(
  path: string,
  fallback: DocumentCandidate['contentKind'],
): 'text' | 'epub' | 'ocr_text' | 'pdf' {
  const detected = contentKindFromUrl(path);
  if (detected !== 'unknown') return detected;
  return fallback === 'unknown' ? 'pdf' : fallback;
}

export function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

export function joinStoragePath(
  basePath: string | undefined,
  filePath: string,
): string {
  if (!basePath || /^\/|^[a-z]:[\\/]/i.test(filePath)) return filePath;
  return `${basePath.replace(/\/+$/, '')}/${filePath.replace(/^\/+/, '')}`;
}
