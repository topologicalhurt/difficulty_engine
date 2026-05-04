export function descendantMap(
  ids: string[],
  prereqById: Record<string, string[]>,
): Record<string, Set<string>> {
  const children: Record<string, string[]> = {};
  ids.forEach((id) => {
    children[id] = [];
  });
  ids.forEach((id) => {
    (prereqById[id] || []).forEach((parent) => {
      if (children[parent]) children[parent].push(id);
    });
  });
  const output: Record<string, Set<string>> = {};
  const visit = (id: string): Set<string> => {
    if (output[id]) return output[id];
    const seen = new Set<string>();
    (children[id] || []).forEach((child) => {
      seen.add(child);
      visit(child).forEach((next) => seen.add(next));
    });
    output[id] = seen;
    return output[id];
  };
  ids.forEach((id) => {
    visit(id);
  });
  return output;
}
