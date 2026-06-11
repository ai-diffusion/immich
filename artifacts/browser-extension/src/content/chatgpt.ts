import { registerExtractor } from '../lib/capture';

const ATTACH_SEL =
  '[class*="attachment"], [class*="file-block"], [class*="paste"], [data-testid*="file"], pre';

// Tier A: probe for full text hidden behind a collapsed/truncated preview.
// textContent includes display:none nodes that innerText skips.
function fullTextOf(el: HTMLElement): string {
  const visible = el.innerText?.trim() ?? '';
  const all = el.textContent?.trim() ?? '';
  return all.length > visible.length + 200 ? all : visible;
}

function attachmentTexts(turn: Element, proseRoots: Element[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  turn.querySelectorAll<HTMLElement>(ATTACH_SEL).forEach((att) => {
    if (proseRoots.some((p) => p !== turn && p.contains(att))) return;
    if (att.closest('button')) return;
    const text = fullTextOf(att);
    if (!text || seen.has(text)) return;
    seen.add(text);
    const isChip =
      att.matches('[data-testid*="file"], [class*="attachment"], [class*="paste"]') ||
      !!att.closest('[data-testid*="file"], [class*="attachment"]');
    if (isChip && text.length < 200) {
      // Tier B: content genuinely not in the page — emit an honest placeholder.
      const name = text.split('\n')[0].slice(0, 80) || 'attachment';
      out.push(`[Attached: ${name} — full content not available in page]`);
    } else if (text.length >= 200) {
      out.push('```\n' + text + '\n```');
    }
  });
  return out;
}

registerExtractor({
  platform: 'ChatGPT',
  turnSelectorTiers: [
    ['article[data-testid^="conversation-turn-"]'],
    ['[data-message-author-role]'],
  ],
  roleOf: (turn) => {
    const roleEl = turn.hasAttribute('data-message-author-role')
      ? turn
      : turn.querySelector('[data-message-author-role]');
    const role = roleEl?.getAttribute('data-message-author-role');
    return role === 'user' || role === 'assistant' ? role : null;
  },
  proseSelectors: [
    '.prose',
    '.markdown',
    '[class*="prose"]',
    '[class*="markdown"]',
    '[class*="whitespace-pre-wrap"]',
  ],
  scrollContainerHint: 'main',
  extractAttachmentTexts: attachmentTexts,
  assetFilter: (el) => !el.closest('button, [class*="avatar"]'),
});
