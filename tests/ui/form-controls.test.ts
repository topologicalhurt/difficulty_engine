// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import { draftNumberInputControl } from '../../src/ui/form-controls';

describe('form controls', () => {
  it('allows clearing a draft number before committing on blur', () => {
    const onCommit = vi.fn();
    const input = draftNumberInputControl({
      value: 1800,
      focusKey: 'test:number',
      onCommit,
    });

    input.value = '';
    input.dispatchEvent(new Event('input'));

    expect(input.value).toBe('');
    expect(onCommit).not.toHaveBeenCalled();

    input.dispatchEvent(new FocusEvent('blur'));

    expect(input.value).toBe('1800');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('commits valid draft numbers on Enter', () => {
    const onCommit = vi.fn();
    const input = draftNumberInputControl({
      value: 1800,
      focusKey: 'test:number',
      onCommit,
    });

    input.value = '2048';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(onCommit).toHaveBeenCalledWith(2048);
  });
});
