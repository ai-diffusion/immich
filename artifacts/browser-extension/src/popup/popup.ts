import type { Asset, Conversation, Format } from '../lib/types';
import { buildFilename, convert } from '../lib/formatters';

let currentConversation: Conversation | null = null;
let currentExportDir = 'chat-export';
let currentTabId: number | null = null;

const EXTRACT_TIMEOUT_MS = 90_000; // auto-scroll on long conversations can take ~40s

function getExtension(format: Format): string {
  const map: Record<Format, string> = { markdown: 'md', text: 'txt', json: 'json', html: 'html' };
  return map[format];
}

function getFilename(format: Format): string {
  if (!currentConversation) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `chat-export-${ts}.${getExtension(format)}`;
  }
  return buildFilename(currentConversation, getExtension(format));
}

function truncate(text: string, maxLength = 200): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

function setStatus(text: string, kind: 'error' | 'info' = 'info'): void {
  const statusEl = document.getElementById('status') as HTMLDivElement;
  statusEl.textContent = text;
  statusEl.className = kind === 'info' ? 'info' : '';
  statusEl.style.display = text ? 'block' : 'none';
}

function renderPreview(conv: Conversation): void {
  const previewEl = document.getElementById('preview') as HTMLDivElement;
  previewEl.innerHTML = '';
  previewEl.style.display = 'block';

  conv.messages.forEach((msg) => {
    const div = document.createElement('div');
    div.className = msg.role === 'user' ? 'msg-user' : 'msg-assistant';

    const label = document.createElement('span');
    label.className = 'msg-label';
    label.textContent = msg.role === 'user' ? 'You' : 'AI';

    const content = document.createElement('p');
    content.style.margin = '0';
    content.textContent = truncate(msg.content);

    div.appendChild(label);
    div.appendChild(content);
    previewEl.appendChild(div);
  });
}

function sendToTab<T>(tabId: number, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.sendMessage(tabId, payload, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response as T);
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(',');
  const mime = head.match(/data:([^;]+)/)?.[1] ?? 'application/octet-stream';
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function downloadViaApi(url: string, filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.downloads.download({ url, filename, conflictAction: 'uniquify' }, (id) => {
      if (chrome.runtime.lastError || id === undefined) {
        reject(new Error(chrome.runtime.lastError?.message ?? 'download failed'));
      } else {
        resolve();
      }
    });
  });
}

interface AssetResponse {
  ok: boolean;
  name?: string;
  dataUrl?: string;
  url?: string;
  error?: string;
}

async function downloadAssets(assets: Asset[]): Promise<void> {
  if (currentTabId === null) return;
  const downloadable = assets.filter((a) => !a.unavailable);
  let done = 0;
  let skipped = 0;

  for (let i = 0; i < downloadable.length; i++) {
    const asset = downloadable[i];
    setStatus(`Downloading asset ${i + 1}/${downloadable.length}: ${asset.name}`);

    const resp = await sendToTab<AssetResponse>(currentTabId, {
      type: 'GET_ASSET',
      id: asset.id,
    }).catch(() => null);

    let url: string | null = null;
    let objectUrl: string | null = null;
    if (resp?.ok && resp.dataUrl) {
      // Object URLs handle large payloads better than data: URLs in Firefox.
      objectUrl = URL.createObjectURL(dataUrlToBlob(resp.dataUrl));
      url = objectUrl;
    } else if (resp?.url || /^https?:/.test(asset.url)) {
      url = resp?.url ?? asset.url;
    }

    if (!url) {
      skipped++;
      continue;
    }

    try {
      await downloadViaApi(url, `${currentExportDir}/${resp?.name ?? asset.name}`);
      done++;
    } catch {
      skipped++;
    }
    if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl!), 60_000);
  }

  setStatus(`Done. ${done} asset(s) downloaded${skipped ? `, ${skipped} skipped` : ''}.`);
}

async function handleDownload(): Promise<void> {
  if (!currentConversation) return;

  const formatSelect = document.getElementById('format') as HTMLSelectElement;
  const format = formatSelect.value as Format;
  const content = convert(currentConversation, format);
  const filename = getFilename(format);

  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  const includeAssets = document.getElementById('include-assets') as HTMLInputElement;
  const assets = currentConversation.assets ?? [];
  if (includeAssets?.checked && assets.length) {
    await downloadAssets(assets);
  }
}

async function handleObsidian(): Promise<void> {
  if (!currentConversation) return;
  const content = convert(currentConversation, 'markdown');
  const filename = getFilename('markdown').replace(/\.md$/, '');
  // obsidian://new creates a note directly in the vault.
  // content is URL-encoded; very large chats will exceed URL limits — we
  // fall back to a plain download so the user can drag it into the vault.
  const MAX_OBSIDIAN_CONTENT = 50_000;
  if (content.length > MAX_OBSIDIAN_CONTENT) {
    setStatus('Chat too large for Obsidian URI — downloading as .md instead.', 'info');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${filename}.md`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    return;
  }
  const uri = `obsidian://new?file=${encodeURIComponent(filename)}&content=${encodeURIComponent(content)}`;
  window.open(uri, '_blank');
  setStatus('Sent to Obsidian. If nothing opened, make sure Obsidian is running.', 'info');
}

async function handleCopy(): Promise<void> {
  if (!currentConversation) return;

  const formatSelect = document.getElementById('format') as HTMLSelectElement;
  const format = formatSelect.value as Format;
  const content = convert(currentConversation, format);
  const copyBtn = document.getElementById('copy') as HTMLButtonElement;
  const originalText = copyBtn.textContent;

  try {
    await navigator.clipboard.writeText(content);
    copyBtn.textContent = 'Copied!';
    setTimeout(() => {
      copyBtn.textContent = originalText ?? 'Copy to Clipboard';
    }, 2000);
  } catch (err) {
    console.error('Failed to copy:', err);
  }
}

interface ExtractResponse {
  conversation?: Conversation;
  exportDirName?: string;
  truncated?: boolean;
  error?: string;
}

document.addEventListener('DOMContentLoaded', async () => {
  const loadingEl = document.getElementById('loading') as HTMLDivElement;
  const previewEl = document.getElementById('preview') as HTMLDivElement;
  const downloadBtn = document.getElementById('download') as HTMLButtonElement;
  const obsidianBtn = document.getElementById('obsidian') as HTMLButtonElement;
  const copyBtn = document.getElementById('copy') as HTMLButtonElement;

  previewEl.style.display = 'none';
  downloadBtn.style.display = 'none';
  obsidianBtn.style.display = 'none';
  copyBtn.style.display = 'none';

  downloadBtn.addEventListener('click', handleDownload);
  obsidianBtn.addEventListener('click', handleObsidian);
  copyBtn.addEventListener('click', handleCopy);

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'EXTRACT_PROGRESS') {
      loadingEl.textContent = `Loading full conversation… (${msg.turnCount} messages found)`;
    }
  });

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];

  if (!tab?.id) {
    setStatus('No active tab found.', 'error');
    loadingEl.style.display = 'none';
    return;
  }
  currentTabId = tab.id;

  loadingEl.textContent = 'Loading full conversation…';

  let response: ExtractResponse;
  try {
    response = await withTimeout(
      sendToTab<ExtractResponse>(tab.id, { type: 'EXTRACT_CONVERSATION' }),
      EXTRACT_TIMEOUT_MS,
    );
  } catch (e) {
    loadingEl.style.display = 'none';
    setStatus(
      String(e).includes('timeout')
        ? 'Timed out loading the conversation — try refreshing the page.'
        : 'Open a supported AI chat page first.',
      'error',
    );
    return;
  }

  loadingEl.style.display = 'none';

  if (response?.error) {
    setStatus(response.error, 'error');
    return;
  }

  const conv = response?.conversation;
  if (!conv || conv.messages.length === 0) {
    setStatus('No conversation found on this page.', 'error');
    return;
  }

  currentConversation = conv;
  currentExportDir = response.exportDirName ?? 'chat-export';

  if (response.truncated) {
    setStatus('Note: very long conversation — export may be incomplete.');
  }

  renderPreview(conv);
  downloadBtn.style.display = 'block';
  obsidianBtn.style.display = 'block';
  copyBtn.style.display = 'block';
});
