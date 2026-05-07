import { el, type Child } from './dom';

const HEADING_RE = /^(#{1,3})\s+(.+)$/;
const BULLET_RE = /^-\s+(.+)$/;
const INLINE_RE = /(`[^`]+`|\[[^\]]+\]\(#[^)]+\))/g;

function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function markdownLink(token: string): HTMLAnchorElement | string {
  const match = /^\[([^\]]+)\]\((#[^)]+)\)$/.exec(token);
  if (!match) return token;
  const link = el('a', {}, match[1]);
  link.href = match[2];
  return link;
}

function inlineNodes(text: string): Child[] {
  const nodes: Child[] = [];
  let cursor = 0;
  for (const match of text.matchAll(INLINE_RE)) {
    const token = match[0];
    const index = match.index ?? 0;
    if (index > cursor) nodes.push(text.slice(cursor, index));
    if (token.startsWith('`')) {
      nodes.push(el('code', {}, token.slice(1, -1)));
    } else {
      nodes.push(markdownLink(token));
    }
    cursor = index + token.length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function paragraph(lines: string[]): HTMLElement | null {
  if (!lines.length) return null;
  return el('p', {}, ...inlineNodes(lines.join(' ')));
}

function list(items: string[]): HTMLElement | null {
  if (!items.length) return null;
  return el(
    'ul',
    { className: 'info-list' },
    ...items.map((item) => el('li', {}, ...inlineNodes(item))),
  );
}

export function renderMarkdownBlocks(markdown: string): HTMLElement[] {
  const blocks: HTMLElement[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];

  function flushText(): void {
    const currentList = list(listItems);
    if (currentList) blocks.push(currentList);
    listItems = [];
    const currentParagraph = paragraph(paragraphLines);
    if (currentParagraph) blocks.push(currentParagraph);
    paragraphLines = [];
  }

  markdown.split(/\r?\n/u).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushText();
      return;
    }
    const heading = HEADING_RE.exec(trimmed);
    if (heading) {
      flushText();
      const level = Math.min(3, heading[1].length);
      const text = heading[2].trim();
      const tag = `h${level}` as 'h1' | 'h2' | 'h3';
      blocks.push(
        el(tag, {
          id: headingId(text),
          text,
        }),
      );
      return;
    }
    const bullet = BULLET_RE.exec(trimmed);
    if (bullet) {
      const currentParagraph = paragraph(paragraphLines);
      if (currentParagraph) blocks.push(currentParagraph);
      paragraphLines = [];
      listItems.push(bullet[1]);
      return;
    }
    const currentList = list(listItems);
    if (currentList) blocks.push(currentList);
    listItems = [];
    paragraphLines.push(trimmed);
  });
  flushText();
  return blocks;
}
