const booleanOptionsByScope = new WeakMap<object, Map<string, boolean>>();

function optionsForScope(scope: object): Map<string, boolean> {
  const existing = booleanOptionsByScope.get(scope);
  if (existing) return existing;
  const next = new Map<string, boolean>();
  booleanOptionsByScope.set(scope, next);
  return next;
}

export function setPendingBooleanOption(
  scope: object,
  key: string,
  value: boolean,
): void {
  optionsForScope(scope).set(key, value);
}

export function getPendingBooleanOption(scope: object, key: string): boolean {
  return optionsForScope(scope).get(key) ?? false;
}
