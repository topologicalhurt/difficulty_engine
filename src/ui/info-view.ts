import { INFO_README } from '../content/info/readme';
import { card, el } from './dom';
import { renderMarkdownBlocks } from './markdown';

export function renderInfoView(): HTMLElement {
  return el(
    'div',
    { className: 'stack-layout info-guide' },
    card('Guide', ...renderMarkdownBlocks(INFO_README)),
  );
}
