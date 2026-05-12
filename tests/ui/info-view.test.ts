// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import { renderInfoView, renderMarkdownReadme } from '../../src/ui/info-view';

describe('info guide view', () => {
  it('renders the tutorial guide from the source document', () => {
    const view = renderInfoView();

    expect(view.textContent).toContain('Difficulty Engine Guide');
    expect(view.textContent).toContain('Quick Start');
    expect(view.querySelector('#graphs')).not.toBeNull();
    expect(view.querySelector('#ai-suggestions')).not.toBeNull();
  });

  it('renders GitHub-style markdown structures without raw HTML', () => {
    const view = renderMarkdownReadme([
      '# Fixture',
      '',
      '| Area | Status |',
      '| --- | --- |',
      '| Graphs | Ready |',
      '',
      '```ts',
      'const ok = true;',
      '```',
      '',
      '<script>bad()</script>',
    ].join('\n'));

    expect(view.classList.contains('markdown-body')).toBe(true);
    expect(view.querySelector('table')).not.toBeNull();
    expect(view.querySelector('pre code')?.textContent).toContain(
      'const ok = true;',
    );
    expect(view.querySelector('script')).toBeNull();
    expect(view.textContent).not.toContain('bad()');
  });

  it('scrolls guide anchors inside the rendered readme', () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    const view = renderInfoView();
    const link = view.querySelector('a[href="#graphs"]');
    if (!(link instanceof HTMLAnchorElement)) {
      throw new Error('Expected graphs guide link.');
    }

    link.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
  });
});
