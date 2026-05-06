export function readPerformanceNowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

export function countVisibleDomNodes(root: HTMLElement): number {
  return root.querySelectorAll('*').length;
}
