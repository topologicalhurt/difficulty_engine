import type { AppState } from '../core/types';
import { badge, el } from './dom';

export function textInput(
  value: string,
  onInput: (next: string) => void,
  placeholder = '',
  focusKey?: string,
): HTMLInputElement {
  return el('input', {
    className: 'text-input',
    type: 'text',
    value,
    focusKey,
    placeholder,
    onInput: (event) => onInput((event.target as HTMLInputElement).value),
  });
}

export function numberInput(
  value: number,
  onInput: (next: number) => void,
  min: number,
  max: number,
  step = 1,
  focusKey?: string,
): HTMLInputElement {
  const input = el('input', {
    className: 'text-input',
    type: 'number',
    value: String(value),
    focusKey,
    onChange: (event) => onInput(Number((event.target as HTMLInputElement).value)),
  });
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  return input;
}

export function checkboxInput(value: boolean, onChange: (next: boolean) => void): HTMLInputElement {
  return el('input', {
    className: 'checkbox-input',
    type: 'checkbox',
    checked: value,
    onChange: (event) => onChange((event.target as HTMLInputElement).checked),
  });
}

export function enrichmentBadge(state: AppState, bookId: string): HTMLElement | null {
  const entry = state.enrichment.byBookId[bookId];
  if (!entry || entry.status === 'idle') {
    return null;
  }
  if (entry.status === 'success') {
    return badge('enriched', 'success');
  }
  if (entry.status === 'loading') {
    return badge('loading');
  }
  if (entry.status === 'stale') {
    return badge('stale', 'warn');
  }
  return badge('failed', 'danger');
}
