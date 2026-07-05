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
    case 'code': {
      if (el.closest('pre')) return kids();
      // Standalone code block (ChatGPT renders <code> without a <pre> wrapper).
      const text = (el as HTMLElement).innerText ?? '';
      if (text.includes('\n')) {
        const lang = el.className.match(/language-(\w+)/)?.[1] ?? '';
        return `\`\`\`${lang}\n${text.trimEnd()}\n\`\`\`\n\n`;
      }
      return `\`${kids()}\``;
    }
    case 'pre': {
      const codeEl = (el as HTMLElement).querySelector('code');
      const text = codeEl ? codeEl.innerText : (el as HTMLElement).innerText;
      const lang = (codeEl?.className ?? el.className).match(/language-(\w+)/)?.[1] ?? '';
      return `\`\`\`${lang}\n${text.trimEnd()}\n\`\`\`\n\n`;
    }
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
    case 'table': {
      const rows = Array.from(el.querySelectorAll(
        ':scope > thead > tr, :scope > tbody > tr, :scope > tfoot > tr, :scope > tr'
      ));
      if (!rows.length) return kids();
      const mdRows: string[] = [];
      let separatorInserted = false;
      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll(':scope > th, :scope > td'));
        if (!cells.length) continue;
        const isHeader = cells.some((c) => c.tagName.toLowerCase() === 'th');
        const rowStr = '| ' + cells
          .map((c) => walk(c, hooks).replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim())
          .join(' | ') + ' |';
        mdRows.push(rowStr);
        if (isHeader && !separatorInserted) {
          mdRows.push('| ' + cells.map(() => '---').join(' | ') + ' |');
          separatorInserted = true;
        }
      }
      if (!separatorInserted && mdRows.length > 0) {
        // All td rows (no th) — insert separator after first row
        const colCount = (mdRows[0].match(/\|/g)?.length ?? 2) - 1;
        mdRows.splice(1, 0, '| ' + Array(colCount).fill('---').join(' | ') + ' |');
      }
      return mdRows.join('\n') + '\n\n';
    }
    case 'thead': case 'tbody': case 'tfoot': return kids();
    case 'tr': case 'th': case 'td': return kids();
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
