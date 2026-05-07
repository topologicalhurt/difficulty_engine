import { button, el, type Child } from './dom';

export function collapsibleCard(
  title: string,
  open: boolean,
  onToggle: (open: boolean) => void,
  ...children: Child[]
): HTMLElement {
  return el(
    'section',
    { className: `card collapsible-card${open ? ' open' : ''}` },
    el(
      'div',
      { className: 'card-header collapsible-card-header' },
      el('h2', { text: title }),
      button(open ? 'Collapse' : 'Expand', {
        className: 'ghost-button compact-button',
        ariaLabel: `${open ? 'Collapse' : 'Expand'} ${title}`,
        onClick: () => onToggle(!open),
      }),
    ),
    open ? el('div', { className: 'card-body' }, ...children) : null,
  );
}
