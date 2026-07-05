import type { Asset } from '../lib/types';
import { registerExtractor } from '../lib/capture';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const ATTACH_SEL =
  '[class*="attachment"], [class*="file-block"], [class*="paste"], [data-testid*="file"], pre';

// Selectors that identify clickable file/document chips (not image chips, not buttons).
const FILE_CHIP_SEL =
  '[data-testid*="file"], [class*="file-block"], ' +
  '[class*="attachment"]:not([class*="image"]):not(button)';

// Tier A: probe for full text hidden behind a collapsed/truncated preview.
// textContent includes display:none nodes that innerText skips.
function fullTextOf(el: HTMLElement): string {
  const visible = el.innerText?.trim() ?? '';
  const all = el.textContent?.trim() ?? '';
  return all.length > visible.length + 200 ? all : visible;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\:*?"<>|]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 120) || 'file';
}

function attachmentTexts(turn: Element, proseRoots: Element[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  turn.querySelectorAll<HTMLElement>(ATTACH_SEL).forEach((att) => {
    if (proseRoots.some((p) => p.contains(att))) return;
    if (att.closest('button')) return;
    const text = fullTextOf(att);
    if (!text || seen.has(text)) return;
    seen.add(text);
    const isChip =
      att.matches('[data-testid*="file"], [class*="attachment"], [class*="paste"]') ||
      !!att.closest('[data-testid*="file"], [class*="attachment"]');
    if (isChip && text.length < 200) {
      // Neutral placeholder — the actual content is downloaded as a companion file.
      const name = text.split('\n')[0].slice(0, 80) || 'attachment';
      out.push(`[File: ${name}]`);
    } else if (text.length >= 200) {
      out.push('```\n' + text + '\n```');
    }
  });
  return out;
}

// Click a file chip, wait for the viewer modal to appear, extract the text,
// then close the modal. Returns null if the modal never appears or is empty.
async function extractChipContent(
  chip: HTMLElement,
): Promise<{ name: string; content: string } | null> {
  // Tier A: content already hidden in DOM (some chips embed it).
  const visible = chip.innerText?.trim() ?? '';
  const hidden = chip.textContent?.trim() ?? '';
  if (hidden.length > visible.length + 200) {
    return { name: sanitizeFilename(visible.split('\n')[0] || 'attachment'), content: hidden };
  }

  const chipLabel = visible.split('\n')[0].trim().slice(0, 120) || 'attachment';

  // Tier C: click to open the viewer modal.
  chip.click();
  let dialog: HTMLElement | null = null;
  for (let i = 0; i < 10; i++) {
    await sleep(250);
    dialog = document.querySelector<HTMLElement>(
      '[role="dialog"], ' +
      '[data-testid="file-viewer-modal"], ' +
      '[class*="FileViewer"], ' +
      '[class*="file-viewer"], ' +
      '[class*="modal"][class*="open"]',
    );
    if (dialog) break;
  }
  if (!dialog) return null;

  // Extract content — prefer <pre> or <code>, fall back to scrollable body.
  const contentEl =
    dialog.querySelector<HTMLElement>('pre, [class*="whitespace-pre"], code') ??
    dialog.querySelector<HTMLElement>('[class*="body"], .overflow-y-auto, [class*="content"]') ??
    dialog;
  const rawContent = contentEl.innerText?.trim() ?? '';

  // Close the modal.
  const closeBtn = dialog.querySelector<HTMLButtonElement>(
    'button[aria-label*="close" i], button[aria-label*="dismiss" i], [data-testid*="close"]',
  );
  if (closeBtn) {
    closeBtn.click();
  } else {
    // Try dispatching Escape on the dialog itself first; bubble to document as fallback.
    const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true });
    dialog.dispatchEvent(escapeEvent);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
  }
  await sleep(300);

  if (!rawContent || rawContent.length < 10) return null;

  // Strip dialog chrome: if the first line is the filename, drop it.
  const lines = rawContent.split('\n');
  const content =
    lines[0].includes(chipLabel.replace(/\.[^.]+$/, '').slice(0, 30))
      ? lines.slice(1).join('\n').trim()
      : rawContent;

  return { name: sanitizeFilename(chipLabel), content };
}

// Called once per turn after scrolling. Returns Asset entries for any pasted/uploaded
// text files found in this turn's chips. userTurnNum is 1-indexed.
async function extractFileAssets(
  turn: Element,
  userTurnNum: number,
  role: 'user' | 'assistant' | null,
): Promise<Asset[]> {
  if (role !== 'user') return [];

  const chips = Array.from(turn.querySelectorAll<HTMLElement>(FILE_CHIP_SEL))
    .filter((el) => !el.closest('button[aria-label], button[class*="model"]'))
    .slice(0, 5); // cap at 5 chips per turn to keep extraction time reasonable

  const results: Asset[] = [];
  for (const chip of chips) {
    // Skip image-like chips
    const label = chip.innerText?.trim() ?? '';
    if (/\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i.test(label)) continue;

    const extracted = await extractChipContent(chip);
    if (!extracted) continue;

    const id = `filechip-${userTurnNum}-${results.length}`;
    const blob = new Blob([extracted.content], { type: 'text/plain' });
    const blobUrl = URL.createObjectURL(blob);

    // Name includes the prompt number so the companion file is clearly labelled.
    results.push({
      id,
      kind: 'file',
      url: blobUrl,
      name: `prompt-${userTurnNum} — ${extracted.name}`,
      messageIndex: userTurnNum,
    });
  }
  return results;
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
    // Assistant turn: primary containers
    '.prose',
    '.markdown',
    '[class*="prose"]',
    '[class*="markdown"]',
    // User turn: plain text message wrapper
    '[class*="whitespace-pre-wrap"]',
    // Fallback: direct message content container (both roles)
    '[data-message-content]',
    '[class*="message-content"]',
  ],
  scrollContainerHint: 'main',
  modelOf: () => {
    const sel = [
      '[data-testid="model-switcher-dropdown-button"]',
      'button[aria-haspopup="listbox"] span',
      '[class*="model-switcher"] span',
      'nav span[class*="model"]',
    ];
    for (const s of sel) {
      const el = document.querySelector(s);
      const text = (el as HTMLElement | null)?.innerText?.trim();
      if (text && text.length < 40) return text;
    }
    return null;
  },
  extractAttachmentTexts: attachmentTexts,
  extractFileAssets,
  assetFilter: (el) => !el.closest('button, [class*="avatar"]'),
});
