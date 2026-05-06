const PDF_TITLE_PATTERN = /\/Title\s*\(([^)]{4,180})\)/g;
const PDF_HEX_TITLE_PATTERN = /\/Title\s*<([0-9a-f\s]{8,360})>/gi;
const PDF_OUTLINE_SCAN_CHARS = 260_000;

export function cleanPdfText(value: string): string {
  return value
    .replace(/\\([()\\])/g, '$1')
    .replace(/\\\d{3}/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function decodePdfHexTitle(value: string): string {
  const hex = value.replace(/\s+/g, '');
  if (hex.length % 2 !== 0) return '';
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return cleanPdfText(new TextDecoder('utf-16be').decode(bytes.slice(2)));
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return cleanPdfText(new TextDecoder('utf-16le').decode(bytes.slice(2)));
  }
  return cleanPdfText(new TextDecoder('iso-8859-1').decode(bytes));
}

export function decodePdfBytes(bytes: Uint8Array): string {
  return cleanPdfText(
    new TextDecoder('iso-8859-1')
      .decode(bytes)
      .slice(0, PDF_OUTLINE_SCAN_CHARS),
  );
}

export function extractPdfOutlineTitles(bytes: Uint8Array): string[] {
  const decoded = decodePdfBytes(bytes);
  const literalTitles = Array.from(decoded.matchAll(PDF_TITLE_PATTERN)).map(
    (match) => cleanPdfText(match[1] ?? ''),
  );
  const hexTitles = Array.from(decoded.matchAll(PDF_HEX_TITLE_PATTERN)).map(
    (match) => decodePdfHexTitle(match[1] ?? ''),
  );
  return [...literalTitles, ...hexTitles].filter(Boolean);
}
