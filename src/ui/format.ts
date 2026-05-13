import {
  formatCssPercent,
  formatOneDecimal,
  formatRatioPercent,
  formatWholeNumber,
} from '../core/number-format';
import { groupColor } from '../core/display-colors';
import { compactStrings } from '../core/utils';

export { formatCssPercent, formatOneDecimal, formatWholeNumber };

export const round0 = formatWholeNumber;
export const formatPercent = formatRatioPercent;
export const formatPages = formatWholeNumber;

export function formatHours(value: number | undefined | null): string {
  return `${formatOneDecimal(value)}h`;
}

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
  return compactStrings(value.split(','));
}

export function joinCsv(values: string[]): string {
  return values.join(', ');
}
