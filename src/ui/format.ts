export function formatOneDecimal(value: number | undefined | null): string {
  const safe = Number.isFinite(value) ? Number(value) : 0;
  return (Math.round((safe + Number.EPSILON) * 10) / 10).toFixed(1);
}

export function round0(value: number | undefined | null): string {
  const safe = Number.isFinite(value) ? Number(value) : 0;
  return String(Math.round(safe));
}

export function formatPercent(value: number | undefined | null): string {
  const safe = Number.isFinite(value) ? Number(value) : 0;
  return `${Math.round(safe * 100)}%`;
}

export function formatCssPercent(ratio: number | undefined | null): string {
  const safe = Number.isFinite(ratio) ? Number(ratio) : 0;
  return `${safe * 100}%`;
}

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
