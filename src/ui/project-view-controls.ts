import { el } from './dom';
import {
  checkboxControl,
  numberInputControl,
  textInputControl,
} from './form-controls';

export function sourceCheckbox(
  checked: boolean,
  label: string,
  detail: string,
  onChange: (checked: boolean) => void,
): HTMLElement {
  return el(
    'label',
    { className: 'source-toggle-row' },
    checkboxControl({
      className: '',
      checked,
      onChange,
    }),
    el(
      'span',
      { className: 'stack-layout compact-stack' },
      el('strong', { text: label }),
      el('span', { className: 'muted-copy', text: detail }),
    ),
  );
}

export function projectTextInput(
  value: string,
  onInput: (value: string) => void,
  focusKey: string,
  placeholder = '',
  type = 'text',
): HTMLInputElement {
  return textInputControl({
    focusKey,
    type,
    value,
    onInput,
    placeholder,
  });
}

export function projectNumberInput(
  value: number,
  onInput: (value: number) => void,
  min: string,
  max: string,
  focusKey: string,
): HTMLInputElement {
  const input = numberInputControl({
    value,
    min,
    max,
    step: 1,
    focusKey,
    onChange: onInput,
    onEmpty: (target) => {
      target.value = String(value);
    },
    onKeyDown: (event) => {
      if (event.key === 'Enter') {
        (event.currentTarget as HTMLInputElement).blur();
      }
    },
  });
  return input;
}
