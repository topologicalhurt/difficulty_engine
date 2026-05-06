import {
  formatCssPercent,
  formatOneDecimal,
  formatRatioPercent,
  formatWholeNumber,
} from '../core/number-format';
import { groupColor } from '../core/display-colors';

export { formatCssPercent, formatOneDecimal };

export const round0 = formatWholeNumber;
export const formatPercent = formatRatioPercent;

export function colorForGroup(group: string): string {
  return groupColor(group);
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
