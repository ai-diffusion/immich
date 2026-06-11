import type { Message, Conversation } from '../lib/types';

function htmlToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  const kids = () => Array.from(el.childNodes).map(htmlToMarkdown).join('');
  switch (tag) {
    case 'h1': return `# ${kids().trim()}\n\n`;
    case 'h2': return `## ${kids().trim()}\n\n`;
    case 'h3': return `### ${kids().trim()}\n\n`;
    case 'h4': return `#### ${kids().trim()}\n\n`;
    case 'strong': case 'b': return `**${kids()}**`;
    case 'em': case 'i': return `_${kids()}_`;
    case 'code': return el.closest('pre') ? kids() : `\`${kids()}\``;
    case 'pre': return `\`\`\`\n${(el as HTMLElement).innerText}\n\`\`\`\n\n`;
    case 'p': return `${kids()}\n\n`;
    case 'br': return '\n';
    case 'hr': return '---\n\n';
    case 'a': {
      const href = (el as HTMLAnchorElement).href ?? '';
      const text = kids().trim();
      return href ? `[${text}](${href})` : text;
    }
    case 'ul': case 'ol': {
      const ordered = tag === 'ol';
      let i = 0;
      return Array.from(el.childNodes)
        .filter(n => (n as Element).tagName?.toLowerCase() === 'li')
        .map(li => `${ordered ? `${++i}.` : '-'} ${htmlToMarkdown(li).trim()}`)
        .join('\n') + '\n\n';
    }
    case 'li': return kids();
    case 'button': case 'svg': case 'script': case 'style': return '';
    default: return kids();
  }
}

function toMarkdown(el: Element): string {
  return htmlToMarkdown(el).replace(/\n{3,}/g, '\n\n').trim();
}

const PROSE_SEL = '.prose, .markdown, [class*="prose"], [class*="markdown"]';
const ATTACH_SEL = 'pre, [class*="attachment"], [class*="file-block"], [class*="paste"], [data-testid*="file"]';

function extractAttachments(container: Element, proseEl: Element | null): string {
  const parts: string[] = [];
  container.querySelectorAll<Element>(ATTACH_SEL).forEach(att => {
    if (proseEl?.contains(att)) return;
    const text = (att as HTMLElement).innerText?.trim();
    if (text) parts.push(text);
  });
  return parts.length ? '\n\n---\n' + parts.join('\n\n---\n') : '';
}

function extractFromTurns(turns: NodeListOf<Element>): Message[] {
  const messages: Message[] = [];
  turns.forEach(turn => {
    const roleEl = turn.hasAttribute('data-message-author-role')
      ? turn
      : turn.querySelector('[data-message-author-role]');
    if (!roleEl) return;
    const role = roleEl.getAttribute('data-message-author-role') as 'user' | 'assistant';
    if (role !== 'user' && role !== 'assistant') return;
    const proseEl = roleEl.querySelector(PROSE_SEL) ?? roleEl;
    let content = toMarkdown(proseEl);
    if (role === 'user') content += extractAttachments(roleEl, proseEl !== roleEl ? proseEl : null);
    if (content) messages.push({ role, content });
  });
  return messages;
}

function extract(): Conversation {
  let turns = document.querySelectorAll<Element>('article[data-testid^="conversation-turn-"]');
  if (!turns.length) turns = document.querySelectorAll<Element>('[data-message-author-role]');
  return {
    title: document.title,
    platform: 'ChatGPT',
    url: window.location.href,
    messages: extractFromTurns(turns),
    exportedAt: new Date().toISOString(),
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'EXTRACT_CONVERSATION') {
    try { sendResponse({ conversation: extract() }); }
    catch (e) { sendResponse({ error: String(e) }); }
  }
  return true;
});
