import type { Message, Conversation } from '../lib/types';

function extract(): Conversation {
  const messages: Message[] = [];
  const elements = document.querySelectorAll('user-query, model-response');

  elements.forEach((el) => {
    const tagName = el.tagName.toLowerCase();
    const role: 'user' | 'assistant' = tagName === 'user-query' ? 'user' : 'assistant';
    const content = (el as HTMLElement).innerText.trim();
    if (content) {
      messages.push({ role, content });
    }
  });

  return {
    title: document.title,
    platform: 'Gemini',
    url: window.location.href,
    messages,
    exportedAt: new Date().toISOString(),
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'EXTRACT_CONVERSATION') {
    try {
      sendResponse({ conversation: extract() });
    } catch (e) {
      sendResponse({ error: String(e) });
    }
  }
  return true;
});
