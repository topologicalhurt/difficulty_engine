import { el } from './dom';

export function sourceCheckbox(
  checked: boolean,
  label: string,
  detail: string,
  onChange: (checked: boolean) => void,
): HTMLElement {
  return el(
    'label',
    { className: 'source-toggle-row' },
    el('input', {
      type: 'checkbox',
      checked,
      onChange: (event) => onChange((event.target as HTMLInputElement).checked),
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
  placeholder = '',
  type = 'text',
): HTMLInputElement {
  return el('input', {
    className: 'text-input',
    type,
    value,
    placeholder,
    onInput: (event) => onInput((event.target as HTMLInputElement).value),
  });
}

export function projectNumberInput(
  value: number,
  onInput: (value: number) => void,
  min: string,
  max: string,
): HTMLInputElement {
  const input = projectTextInput(String(value), (next) => onInput(Number(next)), '', 'number');
  input.min = min;
  input.max = max;
  input.step = '1';
  return input;
}
