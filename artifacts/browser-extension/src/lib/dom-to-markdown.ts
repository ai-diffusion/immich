export interface MarkdownHooks {
  onImage?: (img: HTMLImageElement) => string;
}

function walk(node: Node, hooks: MarkdownHooks): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as Element;
  if (typeof el.className === 'string' && el.className.includes('sr-only')) return '';
  const tag = el.tagName.toLowerCase();
  const kids = () => Array.from(el.childNodes).map((n) => walk(n, hooks)).join('');
  switch (tag) {
    case 'h1': return `# ${kids().trim()}\n\n`;
    case 'h2': return `## ${kids().trim()}\n\n`;
    case 'h3': return `### ${kids().trim()}\n\n`;
    case 'h4': return `#### ${kids().trim()}\n\n`;
    case 'h5': return `##### ${kids().trim()}\n\n`;
    case 'h6': return `###### ${kids().trim()}\n\n`;
    case 'strong': case 'b': return `**${kids()}**`;
    case 'em': case 'i': return `_${kids()}_`;
    case 'code': return el.closest('pre') ? kids() : `\`${kids()}\``;
    case 'pre': return `\`\`\`\n${(el as HTMLElement).innerText}\n\`\`\`\n\n`;
    case 'p': return `${kids()}\n\n`;
    case 'br': return '\n';
    case 'hr': return '---\n\n';
    case 'img': return hooks.onImage ? hooks.onImage(el as HTMLImageElement) : '';
    case 'a': {
      const href = (el as HTMLAnchorElement).href ?? '';
      const text = kids().trim();
      return href ? `[${text}](${href})` : text;
    }
    case 'ul': case 'ol': {
      const ordered = tag === 'ol';
      let i = 0;
      return Array.from(el.childNodes)
        .filter((n) => (n as Element).tagName?.toLowerCase() === 'li')
        .map((li) => `${ordered ? `${++i}.` : '-'} ${walk(li, hooks).trim()}`)
        .join('\n') + '\n\n';
    }
    case 'li': return kids();
    case 'button': case 'svg': case 'script': case 'style': return '';
    default: return kids();
  }
}

export function htmlToMarkdown(root: Node, hooks: MarkdownHooks = {}): string {
  return walk(root, hooks).replace(/\n{3,}/g, '\n\n').trim();
}

// Returns the outermost prose containers matched by the first selector that
// hits, so multi-block responses (text / tool call / text) are all captured.
export function findProseRoots(turn: Element, proseSelectors: string[]): Element[] {
  for (const sel of proseSelectors) {
    const matches = Array.from(turn.querySelectorAll(sel));
    if (matches.length) {
      return matches.filter((m) => !matches.some((o) => o !== m && o.contains(m)));
    }
  }
  return [turn];
}
