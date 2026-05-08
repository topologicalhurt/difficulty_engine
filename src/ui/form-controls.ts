import { el, type ElementProps } from './dom';

export interface SelectOption {
  value: string;
  label: string;
}

export interface TextControlOptions {
  value: string;
  onInput: (value: string) => void;
  focusKey: string;
  placeholder?: string;
  className?: string;
  type?: string;
  listId?: string;
  disabled?: boolean;
}

export interface AutocompleteOption {
  value: string;
  label: string;
  detail?: string;
}

export interface AutocompleteTextControlOptions extends TextControlOptions {
  options: AutocompleteOption[];
  onAccept: (value: string) => void;
}

export interface CheckboxControlOptions {
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
  focusKey?: string;
  onClick?: (event: MouseEvent) => void;
  onFocus?: (event: FocusEvent) => void;
}

export interface NumberControlOptions {
  value: number | string;
  onChange: (value: number) => void;
  className?: string;
  focusKey?: string;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  title?: string;
  ariaLabel?: string;
  onClick?: (event: MouseEvent) => void;
  onFocus?: (event: FocusEvent) => void;
  onKeyDown?: (event: KeyboardEvent) => void;
  onEmpty?: (input: HTMLInputElement) => void;
}

export interface DraftNumberControlOptions
  extends Omit<NumberControlOptions, 'value' | 'onChange'> {
  value: number;
  onCommit: (value: number) => void;
}

export interface FileControlOptions {
  className?: string;
  accept?: string;
  onChange: (file: File | null) => void | Promise<void>;
}

export function selectInput(
  value: string,
  options: SelectOption[],
  props: ElementProps = {},
): HTMLSelectElement {
  const select = el(
    'select',
    props,
    ...options.map((option) =>
      el('option', { value: option.value, text: option.label }),
    ),
  );
  select.value = value;
  return select;
}

export function datalistControl(
  id: string,
  options: string[],
): HTMLDataListElement {
  return el(
    'datalist',
    { id },
    ...options.map((option) => el('option', { value: option })),
  );
}

export function textInputControl(
  options: TextControlOptions,
): HTMLInputElement {
  return el('input', {
    className: options.className ?? 'text-input',
    type: options.type ?? 'text',
    value: options.value,
    focusKey: options.focusKey,
    list: options.listId,
    placeholder: options.placeholder ?? '',
    disabled: options.disabled,
    onInput: (event) => {
      if (event.target instanceof HTMLInputElement) {
        options.onInput(event.target.value);
      }
    },
  });
}

export function autocompleteTextInputControl(
  options: AutocompleteTextControlOptions,
): HTMLElement {
  const best = options.options[0] ?? null;
  const input = textInputControl({
    ...options,
    className: `${options.className ?? 'text-input'} autocomplete-input`,
  });
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || !best) return;
    event.preventDefault();
    options.onAccept(best.value);
  });
  return el(
    'div',
    { className: 'autocomplete-control' },
    el('div', {
      className: 'autocomplete-ghost',
      text: best && best.value !== options.value ? best.value : '',
    }),
    input,
    options.options.length
      ? el(
          'div',
          { className: 'autocomplete-menu' },
          ...options.options.map((option) =>
            el(
              'button',
              {
                className: 'autocomplete-option',
                type: 'button',
                onClick: () => options.onAccept(option.value),
              },
              el('span', { text: option.label }),
              option.detail
                ? el('span', { className: 'muted-copy', text: option.detail })
                : null,
            ),
          ),
        )
      : null,
  );
}

export function draftNumberInputControl(
  options: DraftNumberControlOptions,
): HTMLInputElement {
  const input = el('input', {
    className: options.className ?? 'text-input',
    type: 'number',
    value: String(options.value),
    focusKey: options.focusKey,
    title: options.title,
    ariaLabel: options.ariaLabel,
    onClick: options.onClick,
    onFocus: options.onFocus,
    onBlur: () => commitDraft(),
    onKeyDown: (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      commitDraft();
    },
    onChange: () => commitDraft(),
  });
  function commitDraft(): void {
    const raw = input.value.trim();
    if (!raw) {
      input.value = String(options.value);
      return;
    }
    const next = Number(raw);
    if (!Number.isFinite(next)) {
      input.value = String(options.value);
      return;
    }
    options.onCommit(next);
  }
  if (options.min != null) input.min = String(options.min);
  if (options.max != null) input.max = String(options.max);
  if (options.step != null) input.step = String(options.step);
  return input;
}

export function checkboxControl(
  options: CheckboxControlOptions,
): HTMLInputElement {
  return el('input', {
    className: options.className ?? 'checkbox-input',
    type: 'checkbox',
    checked: options.checked,
    focusKey: options.focusKey,
    onClick: options.onClick,
    onFocus: options.onFocus,
    onChange: (event) => {
      if (event.target instanceof HTMLInputElement) {
        options.onChange(event.target.checked);
      }
    },
  });
}

export function numberInputControl(
  options: NumberControlOptions,
): HTMLInputElement {
  const input = el('input', {
    className: options.className ?? 'text-input',
    type: 'number',
    value: String(options.value),
    focusKey: options.focusKey,
    title: options.title,
    ariaLabel: options.ariaLabel,
    onClick: options.onClick,
    onFocus: options.onFocus,
    onKeyDown: options.onKeyDown,
    onChange: (event) => {
      if (event.target instanceof HTMLInputElement) {
        if (!event.target.value.trim() && options.onEmpty) {
          options.onEmpty(event.target);
          return;
        }
        options.onChange(Number(event.target.value));
      }
    },
  });
  if (options.min != null) input.min = String(options.min);
  if (options.max != null) input.max = String(options.max);
  if (options.step != null) input.step = String(options.step);
  return input;
}

export function fileInputControl(
  options: FileControlOptions,
): HTMLInputElement {
  const input = el('input', {
    className: options.className,
    type: 'file',
    onChange: () => {
      void options.onChange(input.files?.[0] ?? null);
    },
  });
  if (options.accept) input.accept = options.accept;
  return input;
}

export function textAreaControl(
  options: Omit<TextControlOptions, 'type'> & { rows?: number },
): HTMLTextAreaElement {
  const area = el('textarea', {
    className: options.className ?? 'text-area',
    value: options.value,
    focusKey: options.focusKey,
    placeholder: options.placeholder ?? '',
    onInput: (event) => {
      if (event.target instanceof HTMLTextAreaElement) {
        options.onInput(event.target.value);
      }
    },
  });
  if (options.rows != null) {
    area.rows = options.rows;
  }
  return area;
}

export function fieldLabel(label: string, detail?: string): HTMLElement {
  return el(
    'div',
    { className: 'field-label-wrap' },
    el('label', { className: 'field-label', text: label }),
    detail ? el('div', { className: 'field-help', text: detail }) : null,
  );
}

export function inputField(
  label: string,
  input: HTMLElement,
  detail?: string,
  className = 'field',
): HTMLElement {
  return el('div', { className }, fieldLabel(label, detail), input);
}
