export type Child = Node | string | number | boolean | null | undefined;

export interface ElementProps {
  className?: string;
  text?: string;
  htmlFor?: string;
  title?: string;
  id?: string;
  value?: string;
  list?: string;
  type?: string;
  checked?: boolean;
  placeholder?: string;
  name?: string;
  autocomplete?: string;
  disabled?: boolean;
  open?: boolean;
  min?: string;
  max?: string;
  step?: string;
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
  onToggle?: (event: Event) => void;
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
  if (props.list) node.setAttribute('list', props.list);
  if (props.type) (node as HTMLInputElement).type = props.type;
  if (props.checked != null) (node as HTMLInputElement).checked = props.checked;
  if (props.placeholder != null)
    (node as HTMLInputElement | HTMLTextAreaElement).placeholder =
      props.placeholder;
  if (props.name) (node as HTMLInputElement).name = props.name;
  if (props.autocomplete)
    node.setAttribute('autocomplete', props.autocomplete);
  if (props.disabled != null)
    (node as HTMLButtonElement | HTMLInputElement).disabled = props.disabled;
  if (props.open != null) (node as HTMLDetailsElement).open = props.open;
  if (props.min != null) (node as HTMLInputElement).min = props.min;
  if (props.max != null) (node as HTMLInputElement).max = props.max;
  if (props.step != null) (node as HTMLInputElement).step = props.step;
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
  if (props.onToggle) node.addEventListener('toggle', props.onToggle);
  children.forEach((child) => append(node, child));
  return node;
}

export function button(
  label: string,
  props: ElementProps = {},
): HTMLButtonElement {
  return el('button', { type: 'button', ...props, text: label });
}

export interface PanelOptions {
  id?: string;
  className?: string;
  bodyClassName?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  resizable?: 'horizontal' | 'none';
  scrollable?: boolean;
}

const collapsedPanels = new Map<string, boolean>();

function setPanelCollapsed(
  section: HTMLElement,
  body: HTMLElement,
  toggle: HTMLButtonElement | null,
  title: string,
  collapsed: boolean,
): void {
  body.hidden = collapsed;
  body.style.display = collapsed ? 'none' : '';
  section.classList.toggle('collapsed', collapsed);
  section.classList.toggle('open', !collapsed);
  section.dataset.collapsed = String(collapsed);
  if (!toggle) return;
  toggle.textContent = collapsed ? 'Show' : 'Hide';
  toggle.setAttribute('aria-expanded', String(!collapsed));
  toggle.setAttribute(
    'aria-label',
    `${collapsed ? 'Show' : 'Hide'} ${title}`,
  );
}

export function panel(
  title: string,
  options: PanelOptions = {},
  ...children: Child[]
): HTMLElement {
  const panelId = options.id ?? title;
  const collapsible = options.collapsible ?? true;
  const controlledCollapsed = options.open == null ? null : !options.open;
  const collapsed =
    collapsible &&
    (controlledCollapsed ??
      collapsedPanels.get(panelId) ??
      !(options.defaultOpen ?? true));
  const body = el(
    'div',
    {
      className: options.bodyClassName ?? 'card-body',
      dataset: { scrollable: String(options.scrollable ?? true) },
    },
    ...children,
  );
  const toggle: HTMLButtonElement | null = collapsible
    ? button(collapsed ? 'Show' : 'Hide', {
        className: 'ghost-button compact-button panel-toggle-button',
        ariaLabel: `${collapsed ? 'Show' : 'Hide'} ${title}`,
        onClick: (event) => {
          event.stopPropagation();
          const nextCollapsed = !body.hidden;
          if (options.open == null) collapsedPanels.set(panelId, nextCollapsed);
          options.onOpenChange?.(!nextCollapsed);
          setPanelCollapsed(section, body, toggle, title, nextCollapsed);
        },
      })
    : null;
  const section = el(
    'section',
    {
      className: `card panel-card${options.className ? ` ${options.className}` : ''}`,
      dataset: {
        panelId,
        collapsible: String(collapsible),
        collapsed: String(collapsed),
        resizable: options.resizable ?? 'horizontal',
      },
    },
    el(
      'div',
      { className: 'card-header panel-card-header' },
      el('h2', { text: title }),
      toggle,
    ),
    body,
  );
  setPanelCollapsed(section, body, toggle, title, collapsed);
  return section;
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
  return panel(title, {}, ...children);
}
