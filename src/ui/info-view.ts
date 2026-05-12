import { marked } from 'marked';

import { INFO_README } from '../content/info/readme';
import { card, el, type Child } from './dom';

interface MarkdownToken {
  type: string;
  depth?: number;
  ordered?: boolean;
  lang?: string;
  text?: string;
  tokens?: MarkdownToken[];
  items?: MarkdownToken[];
  href?: string;
  header?: MarkdownTableCell[];
  rows?: MarkdownTableCell[][];
}

interface MarkdownTableCell {
  text?: string;
  tokens?: MarkdownToken[];
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

function cssIdSelector(id: string): string {
  const escape = globalThis.CSS?.escape;
  return `#${escape ? escape(id) : id.replace(/["\\#.:,[\]>+~*^$|=]/g, '\\$&')}`;
}

function inlineChildren(
  tokens: MarkdownToken[] | undefined,
  fallback = '',
): Child[] {
  if (!tokens?.length) return [fallback];
  return tokens.flatMap((token): Child[] => {
    if (token.type === 'text' && token.tokens?.length) {
      return inlineChildren(token.tokens, token.text);
    }
    if (token.type === 'strong') {
      return [el('strong', {}, ...inlineChildren(token.tokens, token.text))];
    }
    if (token.type === 'em') {
      return [el('em', {}, ...inlineChildren(token.tokens, token.text))];
    }
    if (token.type === 'codespan') {
      return [el('code', { text: token.text ?? '' })];
    }
    if (token.type === 'del') {
      return [el('del', {}, ...inlineChildren(token.tokens, token.text))];
    }
    if (token.type === 'link') {
      return [markdownLink(token)];
    }
    if (token.type === 'br') return [document.createElement('br')];
    return [token.text ?? ''];
  });
}

function tableCellNode(tag: 'th' | 'td', cell: MarkdownTableCell): HTMLElement {
  return el(tag, {}, ...inlineChildren(cell.tokens, cell.text));
}

function listItemNode(token: MarkdownToken): HTMLElement {
  if ((token.tokens ?? []).every((item) => item.type === 'text')) {
    return el('li', {}, ...inlineChildren(token.tokens, token.text));
  }
  const blocks = (token.tokens ?? [])
    .map(blockNode)
    .filter((node): node is HTMLElement => Boolean(node));
  return blocks.length
    ? el('li', {}, ...blocks)
    : el('li', {}, ...inlineChildren(token.tokens, token.text));
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
      ...(token.items ?? []).map(listItemNode),
    );
  }
  if (token.type === 'code') {
    const code = el('code', { text: token.text ?? '' });
    if (token.lang) code.className = `language-${token.lang}`;
    return el('pre', {}, code);
  }
  if (token.type === 'blockquote') {
    return el(
      'blockquote',
      {},
      ...(token.tokens ?? [])
        .map(blockNode)
        .filter((node): node is HTMLElement => Boolean(node)),
    );
  }
  if (token.type === 'table') {
    return el(
      'table',
      {},
      el(
        'thead',
        {},
        el('tr', {}, ...(token.header ?? []).map((cell) => tableCellNode('th', cell))),
      ),
      el(
        'tbody',
        {},
        ...(token.rows ?? []).map((row) =>
          el('tr', {}, ...row.map((cell) => tableCellNode('td', cell))),
        ),
      ),
    );
  }
  if (token.type === 'hr') return el('hr');
  if (token.type === 'space') return null;
  if (token.type === 'html') return null;
  return token.text ? el('p', { text: token.text }) : null;
}

export function renderMarkdownReadme(source: string): HTMLElement {
  const article = el(
    'article',
    { className: 'markdown-readme markdown-body' },
    ...(marked.lexer(source) as MarkdownToken[])
      .map(blockNode)
      .filter((node): node is HTMLElement => Boolean(node)),
  );
  article.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest('a[href^="#"]');
    if (!(link instanceof HTMLAnchorElement)) return;
    const targetId = decodeURIComponent(link.hash.slice(1));
    if (!targetId) return;
    const section = article.querySelector(cssIdSelector(targetId));
    if (!(section instanceof HTMLElement)) return;
    event.preventDefault();
    section.scrollIntoView({ block: 'start' });
    try {
      globalThis.history?.replaceState(null, '', `#${targetId}`);
    } catch {
      // File-backed embedded hosts may disallow history writes.
    }
  });
  return article;
}

export function renderInfoView(): HTMLElement {
  const article = renderMarkdownReadme(INFO_README);
  return el('div', { className: 'stack-layout info-guide' }, card('Guide', article));
}
