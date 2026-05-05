export function normalizedTokenSet(value: string | undefined): Set<string> {
  return new Set(
    String(value ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .map((part) => part.trim())
      .filter((part) => part.length > 2),
  );
}

export function jaccardTokenSimilarity(
  left: string | undefined,
  right: string | undefined,
): number {
  const leftTokens = normalizedTokenSet(left);
  const rightTokens = normalizedTokenSet(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  let shared = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) shared += 1;
  });
  return shared / Math.max(1, leftTokens.size + rightTokens.size - shared);
}
