export function isSafeTorrentSource(value: string): boolean {
  if (/^magnet:/i.test(value)) return true;
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === 'https:' && /\.torrent(?:$|\?)/i.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}
