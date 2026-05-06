import {
  formatCssPercent,
  formatOneDecimal,
  formatRatioPercent,
  formatWholeNumber,
} from '../core/number-format';

export { formatCssPercent, formatOneDecimal };

export const round0 = formatWholeNumber;
export const formatPercent = formatRatioPercent;

export function colorForGroup(group: string): string {
  let hash = 0;
  for (const char of group) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue} 72% 58%)`;
}

export function formatDate(value?: Date): string {
  if (!value) {
    return '—';
  }
  return value.toLocaleDateString('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function joinCsv(values: string[]): string {
  return values.join(', ');
}
