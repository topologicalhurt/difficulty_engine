import type { AppState } from '../core/types';
import { badge } from './dom';
import {
  checkboxControl,
  numberInputControl,
  textInputControl,
} from './form-controls';

export function textInput(
  value: string,
  onInput: (next: string) => void,
  placeholder = '',
  focusKey: string,
): HTMLInputElement {
  return textInputControl({
    value,
    onInput,
    focusKey,
    placeholder,
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
  return numberInputControl({
    value,
    min,
    max,
    step,
    focusKey,
    onChange: onInput,
  });
}

export function checkboxInput(
  value: boolean,
  onChange: (next: boolean) => void,
): HTMLInputElement {
  return checkboxControl({
    checked: value,
    onChange,
  });
}

export function enrichmentBadge(
  state: AppState,
  bookId: string,
): HTMLElement | null {
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
