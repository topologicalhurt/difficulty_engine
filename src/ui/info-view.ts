import { marked } from 'marked';

import { INFO_README } from '../content/info/readme';
import { card, el, type Child } from './dom';

interface MarkdownToken {
  type: string;
  depth?: number;
  ordered?: boolean;
  text?: string;
  tokens?: MarkdownToken[];
  items?: MarkdownToken[];
  href?: string;
}

function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function markdownLink(token: MarkdownToken): HTMLElement {
  const href = token.href ?? '#';
  const link = el('a', {}, ...inlineChildren(token.tokens, token.text ?? ''));
  link.setAttribute('href', href.startsWith('#') ? href : '#');
  return link;
}

function inlineChildren(
  tokens: MarkdownToken[] | undefined,
  fallback = '',
): Child[] {
  if (!tokens?.length) return [fallback];
  return tokens.flatMap((token): Child[] => {
    if (token.type === 'strong') {
      return [el('strong', {}, ...inlineChildren(token.tokens, token.text))];
    }
    if (token.type === 'em') {
      return [el('em', {}, ...inlineChildren(token.tokens, token.text))];
    }
    if (token.type === 'codespan') {
      return [el('code', { text: token.text ?? '' })];
    }
    if (token.type === 'link') {
      return [markdownLink(token)];
    }
    if (token.type === 'br') return [document.createElement('br')];
    return [token.text ?? ''];
  });
}

function blockNode(token: MarkdownToken): HTMLElement | null {
  if (token.type === 'heading') {
    const depth = Math.max(1, Math.min(3, token.depth ?? 2));
    const text = token.text ?? '';
    const heading = el(
      `h${depth}` as keyof HTMLElementTagNameMap,
      {},
      ...inlineChildren(token.tokens, text),
    );
    heading.id = headingId(text);
    return heading;
  }
  if (token.type === 'paragraph') {
    return el('p', {}, ...inlineChildren(token.tokens, token.text));
  }
  if (token.type === 'list') {
    return el(
      token.ordered ? 'ol' : 'ul',
      {},
      ...(token.items ?? []).map((item) =>
        el('li', {}, ...inlineChildren(item.tokens, item.text)),
      ),
    );
  }
  if (token.type === 'space') return null;
  return token.text ? el('p', { text: token.text }) : null;
}

export function renderInfoView(): HTMLElement {
  const article = el(
    'article',
    { className: 'markdown-readme' },
    ...(marked.lexer(INFO_README) as MarkdownToken[])
      .map(blockNode)
      .filter((node): node is HTMLElement => Boolean(node)),
  );
  return el('div', { className: 'stack-layout info-guide' }, card('Guide', article));
}
