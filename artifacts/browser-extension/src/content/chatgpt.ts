import type { Message, Conversation } from '../lib/types';

function extract(): Conversation {
  const messages: Message[] = [];
  const elements = document.querySelectorAll('[data-message-author-role]');

  elements.forEach((el) => {
    const roleAttr = el.getAttribute('data-message-author-role');
    if (roleAttr === 'user' || roleAttr === 'assistant') {
      const content = (el as HTMLElement).innerText.trim();
      if (content) {
        messages.push({
          role: roleAttr as 'user' | 'assistant',
          content,
        });
      }
    }
  });

  return {
    title: document.title,
    platform: 'ChatGPT',
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
