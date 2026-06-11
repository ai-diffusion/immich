import type { Asset, Conversation, Message } from './types';
import { findProseRoots, htmlToMarkdown } from './dom-to-markdown';

export interface PlatformConfig {
  platform: string;
  // Ordered selector tiers; the first tier that matches anything wins.
  turnSelectorTiers: string[][];
  roleOf: (turn: Element, index: number) => 'user' | 'assistant' | null;
  proseSelectors: string[];
  scrollContainerHint?: string;
  titleOf?: () => string;
  modelOf?: () => string | null;
  extractAttachmentTexts?: (turn: Element, proseRoots: Element[]) => string[];
  assetFilter?: (el: Element) => boolean;
}

type MarkerFor = (img: HTMLImageElement) => string | null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function findTurns(config: PlatformConfig): Element[] {
  for (const tier of config.turnSelectorTiers) {
    const found = document.querySelectorAll<Element>(tier.join(','));
    if (found.length) return Array.from(found);
  }
  return [];
}

function findScrollContainer(sampleTurn: Element | null, hint?: string): Element {
  let start: Element | null = sampleTurn;
  if (!start && hint) start = document.querySelector(hint);
  let el: Element | null = start;
  while (el) {
    if (el.scrollHeight > el.clientHeight + 4) {
      const overflow = getComputedStyle(el).overflowY;
      if (overflow === 'auto' || overflow === 'scroll') return el;
    }
    el = el.parentElement;
  }
  return document.scrollingElement ?? document.documentElement;
}

function pushProgress(turnCount: number, iteration: number): void {
  try {
    const p = chrome.runtime.sendMessage({ type: 'EXTRACT_PROGRESS', turnCount, iteration });
    if (p && typeof (p as Promise<unknown>).catch === 'function') {
      (p as Promise<unknown>).catch(() => {});
    }
  } catch {
    // popup closed; ignore
  }
}

interface ScrollResult {
  truncated: boolean;
  shrinkage: boolean;
}

async function autoScrollToTop(
  container: Element,
  countTurns: () => number,
  onIteration: (iteration: number, count: number, shrinkage: boolean) => void,
): Promise<ScrollResult> {
  const maxIterations = 60;
  const settleMs = 600;
  const stableRequired = 3;

  const target =
    container === document.documentElement || container === document.body
      ? document.scrollingElement ?? document.documentElement
      : container;

  // Nothing to scroll — conversation fits in view.
  if (target.scrollHeight <= target.clientHeight + 4) {
    return { truncated: false, shrinkage: false };
  }

  let prevCount = countTurns();
  let prevHeight = target.scrollHeight;
  let stable = 0;
  let shrinkage = false;
  let truncated = true;

  for (let i = 0; i < maxIterations; i++) {
    target.scrollTop = 0;
    if (target === document.scrollingElement || target === document.documentElement) {
      window.scrollTo(0, 0);
    }
    target.dispatchEvent(new Event('scroll', { bubbles: true }));
    await sleep(settleMs);

    const count = countTurns();
    const height = target.scrollHeight;
    if (count < prevCount) shrinkage = true;
    onIteration(i, count, shrinkage);

    if (count === prevCount && height === prevHeight && target.scrollTop <= 2) {
      if (++stable >= stableRequired) {
        truncated = false;
        break;
      }
    } else {
      stable = 0;
    }
    prevCount = count;
    prevHeight = height;
  }

  target.scrollTop = target.scrollHeight;
  return { truncated, shrinkage };
}

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return slug || 'conversation';
}

// ── Assets ──────────────────────────────────────────────────────────────────

const assetRegistry = new Map<string, { url: string; el: Element | null }>();

function extFromUrl(url: string): string | null {
  const m = url.match(/\.([a-z0-9]{2,5})(?:[?#]|$)/i);
  return m ? m[1].toLowerCase() : null;
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'file';
}

function collectAssets(
  turns: Element[],
  config: PlatformConfig,
  exportDirName: string,
): { assets: Asset[]; markerFor: MarkerFor } {
  assetRegistry.clear();
  const assets: Asset[] = [];
  const markerByEl = new Map<Element, string>();
  let imgCount = 0;

  turns.forEach((turn, messageIndex) => {
    turn.querySelectorAll('img').forEach((img) => {
      if (config.assetFilter && !config.assetFilter(img)) return;
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (w > 0 && w < 40 && h > 0 && h < 40) return; // avatars / UI icons
      const url = img.currentSrc || img.src;
      if (!url || url.startsWith('chrome') || url.startsWith('moz-extension')) return;
      const ext = url.startsWith('data:') || url.startsWith('blob:') ? 'png' : extFromUrl(url) ?? 'png';
      const name = `image-${++imgCount}.${ext}`;
      const id = `asset-${assets.length}`;
      assets.push({ id, kind: 'image', url, name, messageIndex });
      assetRegistry.set(id, { url, el: img });
      markerByEl.set(img, `![image](./${exportDirName}/${name})`);
    });

    turn.querySelectorAll<HTMLAnchorElement>('a[download], a[href*="/files/"]').forEach((a) => {
      if (config.assetFilter && !config.assetFilter(a)) return;
      const url = a.href;
      if (!url || !/^https?:/.test(url)) return;
      const rawName =
        a.getAttribute('download') || a.textContent?.trim() || url.split('/').pop() || 'file';
      const name = sanitizeName(rawName);
      const id = `asset-${assets.length}`;
      assets.push({ id, kind: 'file', url, name, messageIndex });
      assetRegistry.set(id, { url, el: null });
    });
  });

  return {
    assets,
    markerFor: (img) => markerByEl.get(img) ?? null,
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

interface AssetResponse {
  ok: boolean;
  name?: string;
  dataUrl?: string;
  url?: string;
  error?: string;
}

const MAX_TRANSFER_BYTES = 32 * 1024 * 1024;

function imageToDataUrl(img: HTMLImageElement): string | null {
  if (!img.complete || img.naturalWidth === 0) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    return null; // tainted canvas
  }
}

async function getAsset(id: string): Promise<AssetResponse> {
  const entry = assetRegistry.get(id);
  if (!entry) return { ok: false, error: 'unknown-asset' };
  const { url, el } = entry;

  if (url.startsWith('data:')) return { ok: true, dataUrl: url };

  // blob: URLs can't be fetched reliably from a content script — re-encode
  // the rendered image through a canvas instead.
  if (url.startsWith('blob:') && el instanceof HTMLImageElement) {
    const dataUrl = imageToDataUrl(el);
    if (dataUrl) return { ok: true, dataUrl };
  }

  try {
    const resp = await fetch(url, { credentials: 'include' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    if (blob.size > MAX_TRANSFER_BYTES) return { ok: false, error: 'too-large', url };
    return { ok: true, dataUrl: await blobToDataUrl(blob) };
  } catch (e) {
    if (el instanceof HTMLImageElement) {
      const dataUrl = imageToDataUrl(el);
      if (dataUrl) return { ok: true, dataUrl };
    }
    return { ok: false, error: String(e), url };
  }
}

// ── Extraction ──────────────────────────────────────────────────────────────

function extractMessages(
  turns: Element[],
  config: PlatformConfig,
  markerFor: MarkerFor | null,
): Message[] {
  const hooks = {
    onImage: (img: HTMLImageElement) => (markerFor ? markerFor(img) ?? '' : ''),
  };
  const messages: Message[] = [];

  turns.forEach((turn, index) => {
    const role = config.roleOf(turn, index);
    if (role !== 'user' && role !== 'assistant') return;
    const proseRoots = findProseRoots(turn, config.proseSelectors);
    let content = proseRoots
      .map((r) => htmlToMarkdown(r, hooks))
      .filter(Boolean)
      .join('\n\n');
    const extras = config.extractAttachmentTexts?.(turn, proseRoots) ?? [];
    for (const extra of extras) {
      content += (content ? '\n\n---\n' : '') + extra;
    }
    content = content.trim();
    if (content) messages.push({ role, content });
  });

  return messages;
}

// Windows are snapshots taken while scrolling (bottom → top). The last window
// is the topmost view; earlier windows cover progressively lower content, so
// merging last-to-first with dedupe reconstructs the full ordered list.
function mergeWindows(windows: Message[][]): Message[] {
  const result: Message[] = [];
  const seen = new Set<string>();
  for (let i = windows.length - 1; i >= 0; i--) {
    for (const m of windows[i]) {
      const key = m.role + '|' + m.content;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(m);
      }
    }
  }
  return result;
}

async function captureConversation(config: PlatformConfig): Promise<{
  conversation: Conversation;
  exportDirName: string;
  truncated: boolean;
}> {
  const countTurns = () => findTurns(config).length;
  const initialTurns = findTurns(config);
  const container = findScrollContainer(initialTurns[0] ?? null, config.scrollContainerHint ?? 'main');

  const windows: Message[][] = [];
  const scroll = await autoScrollToTop(container, countTurns, (iteration, count, shrinkage) => {
    pushProgress(count, iteration);
    // Snapshot the first window always (cheap insurance) and every window once
    // shrinkage is detected — virtualized DOMs drop turns as you scroll.
    if (iteration === 0 || shrinkage) {
      windows.push(extractMessages(findTurns(config), config, null));
    }
  });

  const turns = findTurns(config);
  const title = (config.titleOf?.() ?? document.title).trim() || 'conversation';
  const model = config.modelOf?.() ?? null;
  const exportDirName = `chat-export-${slugify(title)}`;
  const { assets, markerFor } = collectAssets(turns, config, exportDirName);

  let messages: Message[];
  if (scroll.shrinkage) {
    windows.push(extractMessages(turns, config, null));
    messages = mergeWindows(windows);
  } else {
    messages = extractMessages(turns, config, markerFor);
  }

  return {
    conversation: {
      title,
      platform: config.platform,
      ...(model ? { model } : {}),
      url: window.location.href,
      messages,
      exportedAt: new Date().toISOString(),
      assets,
    },
    exportDirName,
    truncated: scroll.truncated,
  };
}

export function registerExtractor(config: PlatformConfig): void {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'EXTRACT_CONVERSATION') {
      captureConversation(config)
        .then((result) => sendResponse(result))
        .catch((e) => sendResponse({ error: String(e) }));
      return true;
    }
    if (msg?.type === 'GET_ASSET') {
      getAsset(msg.id)
        .then((result) => sendResponse(result))
        .catch((e) => sendResponse({ ok: false, error: String(e) }));
      return true;
    }
    return undefined;
  });
}
