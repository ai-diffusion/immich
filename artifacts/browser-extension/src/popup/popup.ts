import type { Conversation, Format } from '../lib/types';
import { convert } from '../lib/formatters';

let currentConversation: Conversation | null = null;

function getExtension(format: Format): string {
  const map: Record<Format, string> = {
    markdown: 'md',
    text: 'txt',
    json: 'json',
    html: 'html',
  };
  return map[format];
}

function truncate(text: string, maxLength = 200): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
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

async function handleDownload(): Promise<void> {
  if (!currentConversation) return;

  const formatSelect = document.getElementById('format') as HTMLSelectElement;
  const format = formatSelect.value as Format;
  const content = convert(currentConversation, format);
  const extension = getExtension(format);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `chat-export-${timestamp}.${extension}`;

  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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

document.addEventListener('DOMContentLoaded', async () => {
  const loadingEl = document.getElementById('loading') as HTMLDivElement;
  const statusEl = document.getElementById('status') as HTMLDivElement;
  const previewEl = document.getElementById('preview') as HTMLDivElement;
  const downloadBtn = document.getElementById('download') as HTMLButtonElement;
  const copyBtn = document.getElementById('copy') as HTMLButtonElement;

  previewEl.style.display = 'none';
  downloadBtn.style.display = 'none';
  copyBtn.style.display = 'none';

  downloadBtn.addEventListener('click', handleDownload);
  copyBtn.addEventListener('click', handleCopy);

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];

  if (!tab?.id) {
    statusEl.textContent = 'No active tab found.';
    statusEl.style.display = 'block';
    loadingEl.style.display = 'none';
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_CONVERSATION' }, (response) => {
    loadingEl.style.display = 'none';

    if (chrome.runtime.lastError) {
      statusEl.textContent = 'Open a supported AI chat page first.';
      statusEl.style.display = 'block';
      return;
    }

    if (response?.error) {
      statusEl.textContent = response.error;
      statusEl.style.display = 'block';
      return;
    }

    const conv = response?.conversation as Conversation | undefined;

    if (!conv || conv.messages.length === 0) {
      statusEl.textContent = 'No conversation found on this page.';
      statusEl.style.display = 'block';
      return;
    }

    currentConversation = conv;
    renderPreview(conv);
    downloadBtn.style.display = 'block';
    copyBtn.style.display = 'block';
  });
});
