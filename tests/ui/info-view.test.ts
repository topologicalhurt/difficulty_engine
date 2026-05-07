// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { renderInfoView } from '../../src/ui/info-view';

describe('info guide view', () => {
  it('renders the tutorial guide from the source document', () => {
    const view = renderInfoView();

    expect(view.textContent).toContain('Difficulty Engine Guide');
    expect(view.textContent).toContain('Quick Start');
    expect(view.querySelector('#graphs')).not.toBeNull();
    expect(view.querySelector('#ai-suggestions')).not.toBeNull();
  });
});
