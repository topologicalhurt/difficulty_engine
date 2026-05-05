export type Child = Node | string | number | boolean | null | undefined;

export interface ElementProps {
  className?: string;
  text?: string;
  htmlFor?: string;
  title?: string;
  id?: string;
  value?: string;
  type?: string;
  checked?: boolean;
  placeholder?: string;
  disabled?: boolean;
  focusKey?: string;
  dataset?: Record<string, string>;
  role?: string;
  tabIndex?: number;
  ariaLabel?: string;
  onClick?: (event: MouseEvent) => void;
  onFocus?: (event: FocusEvent) => void;
  onKeyDown?: (event: KeyboardEvent) => void;
  onInput?: (event: Event) => void;
  onChange?: (event: Event) => void;
  onBlur?: (event: FocusEvent) => void;
}

function append(parent: HTMLElement, child: Child): void {
  if (child == null || child === false) {
    return;
  }
  if (child instanceof Node) {
    parent.append(child);
    return;
  }
  parent.append(document.createTextNode(String(child)));
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElementProps = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.text != null) node.textContent = props.text;
  if (props.htmlFor) (node as HTMLLabelElement).htmlFor = props.htmlFor;
  if (props.title) node.title = props.title;
  if (props.id) node.id = props.id;
  if (props.value != null)
    (node as HTMLInputElement | HTMLTextAreaElement).value = props.value;
  if (props.type) (node as HTMLInputElement).type = props.type;
  if (props.checked != null) (node as HTMLInputElement).checked = props.checked;
  if (props.placeholder != null)
    (node as HTMLInputElement | HTMLTextAreaElement).placeholder =
      props.placeholder;
  if (props.disabled != null)
    (node as HTMLButtonElement | HTMLInputElement).disabled = props.disabled;
  if (props.focusKey) node.dataset.focusKey = props.focusKey;
  if (props.role) node.setAttribute('role', props.role);
  if (props.tabIndex != null) node.tabIndex = props.tabIndex;
  if (props.ariaLabel) node.setAttribute('aria-label', props.ariaLabel);
  if (props.dataset) {
    Object.entries(props.dataset).forEach(([key, value]) => {
      node.dataset[key] = value;
    });
  }
  if (props.onClick)
    node.addEventListener('click', props.onClick as EventListener);
  if (props.onFocus)
    node.addEventListener('focus', props.onFocus as EventListener);
  if (props.onKeyDown)
    node.addEventListener('keydown', props.onKeyDown as EventListener);
  if (props.onInput) node.addEventListener('input', props.onInput);
  if (props.onChange) node.addEventListener('change', props.onChange);
  if (props.onBlur)
    node.addEventListener('blur', props.onBlur as EventListener);
  children.forEach((child) => append(node, child));
  return node;
}

export function button(
  label: string,
  props: ElementProps = {},
): HTMLButtonElement {
  return el('button', { type: 'button', ...props, text: label });
}

export function badge(
  label: string,
  tone: 'neutral' | 'success' | 'warn' | 'danger' = 'neutral',
): HTMLElement {
  return el('span', { className: `badge badge-${tone}`, text: label });
}

export function emptyState(title: string, message: string): HTMLElement {
  return el(
    'div',
    { className: 'empty-state' },
    el('h3', { text: title }),
    el('p', { text: message }),
  );
}

export function card(title: string, ...children: Child[]): HTMLElement {
  return el(
    'section',
    { className: 'card' },
    el('div', { className: 'card-header' }, el('h2', { text: title })),
    el('div', { className: 'card-body' }, ...children),
  );
}
