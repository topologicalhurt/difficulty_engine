import { panel, type Child } from './dom';

export function collapsibleCard(
  title: string,
  open: boolean,
  onToggle: (open: boolean) => void,
  ...children: Child[]
): HTMLElement {
  return panel(
    title,
    {
      id: `plan:${title}`,
      className: 'collapsible-card',
      open,
      onOpenChange: onToggle,
    },
    ...children,
  );
}
