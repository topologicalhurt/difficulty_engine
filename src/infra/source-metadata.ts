import { normalizedIsbn } from '../core/isbn';
import { compactString, compactStrings } from '../core/utils';

const HTML_TAG_PATTERN = /<[^>]+>/g;
const PUBLISHED_YEAR_PATTERN = /\b(1[5-9]\d{2}|20\d{2}|21\d{2})\b/;

export function normalizeProviderText(value: unknown): string {
  return compactString(
    String(value ?? '').replace(HTML_TAG_PATTERN, ' '),
  ).replace(/\s+/g, ' ');
}

export function normalizeProviderTextArray(values: unknown[]): string[] {
  return compactStrings(values.map(normalizeProviderText));
}

export function extractPublishedYear(value: unknown): number | null {
  const match = normalizeProviderText(value).match(PUBLISHED_YEAR_PATTERN);
  return match ? Number(match[1]) : null;
}

export function firstValidIsbn(values: unknown[]): string | null {
  for (const value of values) {
    const isbn = normalizedIsbn(String(value ?? ''));
    if (isbn) return isbn;
  }
  return null;
}
