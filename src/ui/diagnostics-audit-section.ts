import { badge, card, el } from './dom';

function renderAuditList(title: string, items: string[], tone: 'neutral' | 'warn' | 'danger'): HTMLElement {
  return card(
    title,
    items.length
      ? el(
          'div',
          { className: 'stack-list' },
          ...items.map((item) =>
            el('div', { className: 'stack-row' }, badge(title.toLowerCase(), tone), el('div', { text: item })),
          ),
        )
      : el('div', { className: 'muted-copy', text: `No ${title.toLowerCase()}.` }),
  );
}

export function renderAuditSummary(
  passes: string[],
  warnings: string[],
  failures: string[],
): HTMLElement {
  return el(
    'div',
    { className: 'triple-layout' },
    renderAuditList('Passes', passes, 'neutral'),
    renderAuditList('Warnings', warnings, 'warn'),
    renderAuditList('Failures', failures, 'danger'),
  );
}
