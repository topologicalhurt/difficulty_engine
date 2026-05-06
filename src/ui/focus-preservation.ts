interface FocusSnapshot {
  key: string;
  start: number | null;
  end: number | null;
  scrollTop: number;
  scrollLeft: number;
}

function isFocusableInput(
  node: Element,
): node is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  return (
    node instanceof HTMLInputElement ||
    node instanceof HTMLTextAreaElement ||
    node instanceof HTMLSelectElement
  );
}

function captureSelection(input: HTMLInputElement | HTMLTextAreaElement): {
  start: number | null;
  end: number | null;
} {
  try {
    return {
      start: input.selectionStart,
      end: input.selectionEnd,
    };
  } catch {
    return { start: null, end: null };
  }
}

export function captureFocus(root: HTMLElement): FocusSnapshot | null {
  const active = document.activeElement;
  if (!active || !isFocusableInput(active) || !root.contains(active))
    return null;
  const key = active.dataset.focusKey;
  if (!key) return null;
  const selection =
    active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
      ? captureSelection(active)
      : { start: null, end: null };
  return {
    key,
    start: selection.start,
    end: selection.end,
    scrollTop:
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement
        ? active.scrollTop
        : 0,
    scrollLeft:
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement
        ? active.scrollLeft
        : 0,
  };
}

export function restoreFocus(
  root: HTMLElement,
  snapshot: FocusSnapshot | null,
): void {
  if (!snapshot) return;
  const target =
    Array.from(root.querySelectorAll<HTMLElement>('[data-focus-key]')).find(
      (node) => node.dataset.focusKey === snapshot.key,
    ) ?? null;
  if (!target || !isFocusableInput(target)) return;
  target.focus({ preventScroll: true });
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement
  ) {
    try {
      if (snapshot.start != null && snapshot.end != null) {
        target.setSelectionRange(snapshot.start, snapshot.end);
      }
    } catch {
      // Some input types do not support selection ranges.
    }
    target.scrollTop = snapshot.scrollTop;
    target.scrollLeft = snapshot.scrollLeft;
  }
}
